import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { EVENTS, ProductUpdatedEvent } from '@packages/events';
import { Repository } from 'typeorm';
import { ProductEntity } from '../entities/product.entity';
import { ProductType } from '../enums/product-type.enum';
import { VariantStatus } from '../enums/variant-status.enum';
import { IBundleOosComponent } from '../interfaces/bundle-availability.interface';
import {
  BUNDLE_COMPONENT_OOS_REASON,
  BundleChildInput,
  bundleOosComponentKey,
  listUnavailableBundleComponents,
} from '../utils/bundle-availability.util';
import { OosEmailQueueService } from '@modules/oos-email/services/oos-email-queue.service';
import { BundleOosEmailJobData } from '@modules/oos-email/constants/oos-email-queue.constants';
import { coerceDbBoolean } from '../../../packages/common/src/stock-validation.config';

interface BundleHeaderRow {
  id: string;
  refId: string;
  name: string;
  bundleComponentOos: boolean;
  bundleOosComponents: IBundleOosComponent[] | null;
  sku: string | null;
}

interface BundleComponentRow {
  bundleId: string;
  quantity: number | string | null;
  childId: string | null;
  childRefId: string | null;
  childName: string | null;
  childType: string | null;
  childBundleComponentOos: boolean | null;
  childDeletedAt: Date | null;
  variantSku: string | null;
  variantName: string | null;
  variantStock: number | string | null;
  variantOutOfStock: boolean | null;
  variantInCurekaInventory: boolean | null;
  variantStatus: string | null;
  variantDeletedAt: Date | null;
}

interface ComputedBundle {
  id: string;
  refId: string;
  name: string;
  sku: string | null;
  oos: boolean;
  components: IBundleOosComponent[];
  changed: boolean;
  email: boolean;
}

const MAX_WAVES = 20;

@Injectable()
export class BundleAvailabilityService {
  private readonly logger = new Logger(BundleAvailabilityService.name);
  /** Bundle ids whose snapshot was just written; the follow-up product event skips them. */
  private readonly skipNext = new Set<string>();

  constructor(
    @InjectRepository(ProductEntity)
    private readonly products: Repository<ProductEntity>,
    private readonly eventEmitter: EventEmitter2,
    private readonly oosEmailQueueService: OosEmailQueueService,
  ) {}

  consumeSkip(productId: string): boolean {
    if (!this.skipNext.has(productId)) return false;
    this.skipNext.delete(productId);
    return true;
  }

  async recalculateForRefIds(refIds: string[]): Promise<void> {
    const unique = [...new Set(refIds.map((refId) => refId.trim()).filter(Boolean))];
    if (!unique.length) return;

    const rows = await this.products.manager.query<Array<{ id: string }>>(
      `
      -- bundle-availability:ids-by-ref
      SELECT id
      FROM products
      WHERE ref_id = ANY($1::varchar[])
        AND deleted_at IS NULL
      `,
      [unique],
    );
    const ids = rows.map((row) => row.id).filter((id) => !this.consumeSkip(id));
    if (!ids.length) return;
    await this.recalculateForProducts(ids);
  }

  async recalculateForProducts(productIds: string[]): Promise<void> {
    const pending = new Set(productIds.filter(Boolean));
    const processed = new Set<string>();
    const emails: BundleOosEmailJobData[] = [];
    const changed: Array<{ id: string; refId: string }> = [];
    let wave = 0;

    while (pending.size > 0 && wave < MAX_WAVES) {
      wave += 1;
      const targets = await this.findBundleTargets([...pending]);
      for (const id of [...pending]) {
        if (!targets.includes(id)) pending.delete(id);
      }
      const batchIds = targets.filter((id) => !processed.has(id));
      if (!batchIds.length) break;

      const loaded = await this.loadBundles(batchIds);
      const byId = new Map(loaded.map((bundle) => [bundle.id, bundle]));
      const readyIds = batchIds.filter((id) => {
        const bundle = byId.get(id);
        if (!bundle) return false;
        return bundle.children.every(
          (child) =>
            child.productType !== ProductType.BUNDLE ||
            !batchIds.includes(child.id) ||
            child.id === id,
        );
      });
      const waveIds = readyIds.length ? readyIds : batchIds;
      const computed = waveIds
        .map((id) => byId.get(id))
        .filter((bundle): bundle is LoadedBundle => Boolean(bundle))
        .map((bundle) => this.compute(bundle));

      const updates = computed.filter((bundle) => bundle.changed);
      if (updates.length) {
        await this.persist(updates);
      }

      for (const id of waveIds) {
        pending.delete(id);
        processed.add(id);
      }

      const changedIds = updates.map((bundle) => bundle.id);
      if (changedIds.length) {
        const parentIds = await this.findParentBundleIds(changedIds);
        for (const parentId of parentIds) {
          if (!processed.has(parentId)) pending.add(parentId);
        }
      }

      for (const bundle of updates) {
        changed.push({ id: bundle.id, refId: bundle.refId });
        if (!bundle.email) continue;
        emails.push({
          bundleRefId: bundle.refId,
          bundleName: bundle.name,
          bundleSku: bundle.sku ?? '',
          reason: BUNDLE_COMPONENT_OOS_REASON,
          components: bundle.components,
          occurredAt: new Date().toISOString(),
        });
      }
    }

    if (wave >= MAX_WAVES) {
      this.logger.warn('Stopped bundle availability recalculation at the wave limit');
    }

    for (const bundle of changed) this.skipNext.add(bundle.id);
    if (emails.length) {
      this.oosEmailQueueService.enqueueBundleOosSafe(emails);
    }
    await Promise.all(
      changed.map((bundle) =>
        this.eventEmitter.emitAsync(
          EVENTS.PRODUCT_UPDATED,
          new ProductUpdatedEvent(bundle.refId, 'updated'),
        ),
      ),
    );
  }

  private compute(bundle: LoadedBundle): ComputedBundle {
    const components = listUnavailableBundleComponents(bundle.children);
    const oos = components.length > 0;
    const previousKey = bundleOosComponentKey(bundle.bundleOosComponents);
    const nextKey = bundleOosComponentKey(oos ? components : []);
    const changed = bundle.bundleComponentOos !== oos || previousKey !== nextKey;
    return {
      id: bundle.id,
      refId: bundle.refId,
      name: bundle.name,
      sku: bundle.sku,
      oos,
      components,
      changed,
      email: changed && oos,
    };
  }

  private async findBundleTargets(productIds: string[]): Promise<string[]> {
    if (!productIds.length) return [];
    const rows = await this.products.manager.query<Array<{ id: string }>>(
      `
      -- bundle-availability:targets
      SELECT DISTINCT id
      FROM (
        SELECT parent_product_id AS id
        FROM product_bundles
        WHERE child_product_id = ANY($1::uuid[])
        UNION
        SELECT p.id
        FROM products p
        WHERE p.id = ANY($1::uuid[])
          AND p.product_type = 'bundle'
          AND p.deleted_at IS NULL
      ) targets
      `,
      [productIds],
    );
    return rows.map((row) => row.id);
  }

  private async findParentBundleIds(bundleIds: string[]): Promise<string[]> {
    if (!bundleIds.length) return [];
    const rows = await this.products.manager.query<Array<{ id: string }>>(
      `
      -- bundle-availability:parents
      SELECT DISTINCT parent_product_id AS id
      FROM product_bundles
      WHERE child_product_id = ANY($1::uuid[])
      `,
      [bundleIds],
    );
    return rows.map((row) => row.id);
  }

  private async loadBundles(bundleIds: string[]): Promise<LoadedBundle[]> {
    const [headers, componentRows] = await Promise.all([
      this.products.manager.query<BundleHeaderRow[]>(
        `
        -- bundle-availability:headers
        SELECT
          p.id,
          p.ref_id AS "refId",
          p.name,
          p.bundle_component_oos AS "bundleComponentOos",
          p.bundle_oos_components AS "bundleOosComponents",
          (
            SELECT pv.sku
            FROM product_variants pv
            WHERE pv.product_id = p.id
              AND pv.deleted_at IS NULL
            ORDER BY pv.created_at ASC
            LIMIT 1
          ) AS sku
        FROM products p
        WHERE p.id = ANY($1::uuid[])
          AND p.product_type = 'bundle'
          AND p.deleted_at IS NULL
        `,
        [bundleIds],
      ),
      this.products.manager.query<BundleComponentRow[]>(
        `
        -- bundle-availability:components
        SELECT
          pb.parent_product_id AS "bundleId",
          pb.quantity,
          child.id AS "childId",
          child.ref_id AS "childRefId",
          child.name AS "childName",
          child.product_type AS "childType",
          COALESCE(child.bundle_component_oos, false) AS "childBundleComponentOos",
          child.deleted_at AS "childDeletedAt",
          cv.sku AS "variantSku",
          cv.display_name AS "variantName",
          cv.stock AS "variantStock",
          cv.out_of_stock AS "variantOutOfStock",
          cv.in_cureka_inventory AS "variantInCurekaInventory",
          cv.status AS "variantStatus",
          cv.deleted_at AS "variantDeletedAt"
        FROM product_bundles pb
        LEFT JOIN products child ON child.id = pb.child_product_id
        LEFT JOIN product_variants cv
          ON cv.product_id = child.id
          AND cv.deleted_at IS NULL
        WHERE pb.parent_product_id = ANY($1::uuid[])
        `,
        [bundleIds],
      ),
    ]);

    const childrenByBundle = new Map<string, Map<string, BundleChildInput & { id: string }>>();
    for (const row of componentRows) {
      const childKey = row.childId ?? `missing:${row.bundleId}:${row.childName ?? ''}`;
      const byChild = childrenByBundle.get(row.bundleId) ?? new Map();
      const existing = byChild.get(childKey) ?? {
        id: row.childId ?? '',
        refId: row.childRefId ?? '',
        name: row.childName ?? 'Unknown product',
        productType: (row.childType ?? ProductType.SIMPLE) as ProductType,
        bundleComponentOos: coerceDbBoolean(row.childBundleComponentOos),
        deleted: !row.childId || Boolean(row.childDeletedAt),
        quantity: Number(row.quantity ?? 1),
        variants: [],
      };
      if (row.variantSku) {
        existing.variants.push({
          sku: row.variantSku,
          name: row.variantName,
          stock: Number(row.variantStock ?? 0),
          outOfStock: coerceDbBoolean(row.variantOutOfStock),
          inCurekaInventory: coerceDbBoolean(row.variantInCurekaInventory),
          status: row.variantStatus ?? VariantStatus.ACTIVE,
          deletedAt: row.variantDeletedAt,
        });
      }
      byChild.set(childKey, existing);
      childrenByBundle.set(row.bundleId, byChild);
    }

    return headers.map((header) => ({
      id: header.id,
      refId: header.refId,
      name: header.name,
      sku: header.sku,
      bundleComponentOos: coerceDbBoolean(header.bundleComponentOos),
      bundleOosComponents: header.bundleOosComponents,
      children: [...(childrenByBundle.get(header.id)?.values() ?? [])],
    }));
  }

  private async persist(bundles: ComputedBundle[]): Promise<void> {
    await this.products.manager.query(
      `
      -- bundle-availability:persist
      UPDATE products p
      SET
        bundle_component_oos = v.oos,
        bundle_oos_components = v.components,
        updated_at = NOW()
      FROM jsonb_to_recordset($1::jsonb) AS v(id uuid, oos boolean, components jsonb)
      WHERE p.id = v.id
      `,
      [
        JSON.stringify(
          bundles.map((bundle) => ({
            id: bundle.id,
            oos: bundle.oos,
            components: bundle.oos ? bundle.components : null,
          })),
        ),
      ],
    );
  }
}

interface LoadedBundle {
  id: string;
  refId: string;
  name: string;
  sku: string | null;
  bundleComponentOos: boolean;
  bundleOosComponents: IBundleOosComponent[] | null;
  children: Array<BundleChildInput & { id: string }>;
}
