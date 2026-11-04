import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { ProductType } from '@modules/product/enums/product-type.enum';
import { PromotionalPageStatus } from '@modules/promotional-pages/enums/promotional-page-status.enum';
import { PromotionalTargetType } from '@modules/promotional-pages/enums/promotional-target-type.enum';
import { PromotionalPageEntity } from '@modules/promotional-pages/entities/promotional-page.entity';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { PRODUCT_MATCHES_CATEGORY_ENTITY_SQL } from '@modules/product/utils/product-category-hierarchies.util';
import { isCartUuid } from '@modules/orders/utils/cart-lookup-id.util';
import { DataSource, IsNull } from 'typeorm';
import { GokwikRepository } from '../repositories/gokwik.repository';
import {
  GokwikCollectionLockBusyError,
  GokwikCollectionLockService,
} from './gokwik-collection-lock.service';
import { GokwikApiService } from './gokwik-api.service';
import { GokwikQueueService } from './gokwik-queue.service';

const CATALOG_PRODUCT_TYPES = [ProductType.SIMPLE, ProductType.VARIABLE, ProductType.BUNDLE];

const LIVE_PROMOTIONAL_STATUSES = new Set([
  PromotionalPageStatus.PUBLISHED,
  PromotionalPageStatus.SCHEDULED,
]);

type GokwikCollectionPayload = {
  id: string;
  handle: string;
  title: string;
  name: string;
  product_ids: string[];
  updated_at: string;
  is_deleted: boolean;
};

@Injectable()
export class GokwikCatalogSyncService {
  private readonly logger = new Logger(GokwikCatalogSyncService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly apiService: GokwikApiService,
    private readonly repository: GokwikRepository,
    private readonly queueService: GokwikQueueService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly collectionLock: GokwikCollectionLockService,
  ) {}

  async syncProduct(productId: string): Promise<void> {
    this.assertConfiguredEnabled();
    await this.repository.markSyncState('product', productId, 'syncing');
    try {
      // withDeleted so soft-deleted products can be pushed as is_deleted=true
      const product = await this.dataSource.getRepository(ProductEntity).findOne({
        where: { id: productId },
        relations: { variants: true, media: true, tagMappings: { tag: true } },
        withDeleted: true,
      });
      if (!product) throw new NotFoundException('Product not found');

      const activeVariants = (product.variants ?? []).filter((variant) => !variant.deletedAt);
      const media = product.media ?? [];

      const images = (
        await Promise.all(
          media.map(async (item) => {
            const src = (await this.storageUrlEnricher.toReference(item.url))?.url ?? '';
            if (!src) return null;
            return {
              id: item.id,
              product_id: product.id,
              src,
              variant_ids: item.variantId ? [item.variantId] : [],
            };
          }),
        )
      ).filter((image): image is NonNullable<typeof image> => Boolean(image));

      const fallbackImageId = images[0]?.id ?? '';
      const isDeleted = Boolean(product.deletedAt) || product.status !== ProductStatus.PUBLISHED;
      // GoKwik Sync Product only documents status = "published"
      const status = 'published';
      const tags = (product.tagMappings ?? [])
        .map((mapping) => mapping.tag?.slug ?? mapping.tag?.name ?? '')
        .filter(Boolean)
        .join(',');

      const payload = {
        id: product.id,
        title: product.name,
        status,
        tags,
        updated_at: (product.updatedAt ?? new Date()).toISOString(),
        handle: product.slug,
        body_html: product.description ?? '',
        is_deleted: isDeleted,
        variants: activeVariants.map((variant) => {
          const variantImageId =
            media.find((item) => item.variantId === variant.id)?.id ?? fallbackImageId;
          return {
            id: variant.id,
            product_id: product.id,
            image_id: variantImageId || product.id,
            title: variant.displayName?.trim() || variant.slug || variant.sku,
            sku: variant.sku,
            price: Math.round(Number(variant.sellingPrice) || 0),
            compare_at_price: Math.round(Number(variant.mrp) || Number(variant.sellingPrice) || 0),
            inventory_quantity: Math.max(0, Number(variant.stock) || 0),
          };
        }),
        images,
      };

      this.logger.log(
        {
          productId: product.id,
          refId: product.refId,
          status: product.status,
          is_deleted: isDeleted,
          variantCount: payload.variants.length,
          imageCount: payload.images.length,
        },
        'Syncing product to GoKwik',
      );

      await this.apiService.syncProducts(payload);
      await this.repository.markSyncState('product', productId, 'synced', {
        remoteId: product.externalProductId ?? product.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown product sync error';
      this.logger.error({ productId, error: message }, 'GoKwik product sync failed');
      await this.repository.markSyncState('product', productId, 'failed', {
        lastError: message,
      });
      throw error;
    }
  }

  /**
   * Sync a Cureka category or promotional page as a GoKwik collection.
   * Collection-specific coupons only apply when:
   * 1. the collection lists live product UUIDs, and
   * 2. those products exist in GoKwik's product catalog (`is_deleted: false`).
   * `promotionType` on Sync Product is ignored by GoKwik.
   */
  async syncCollection(resourceId: string): Promise<void> {
    this.assertConfiguredEnabled();
    const resolved = await this.resolveCollectionSource(resourceId);
    if (resolved.kind === 'category') {
      await this.pushCategoryCollection(resolved.category);
      return;
    }
    await this.pushPromotionalPageCollection(resolved.page);
  }

  async resolveCollectionSource(idOrSlug: string): Promise<
    | { kind: 'category'; category: CategoryEntity }
    | { kind: 'promotional_page'; page: PromotionalPageEntity }
  > {
    const trimmed = idOrSlug.trim();
    if (isCartUuid(trimmed)) {
      const category = await this.dataSource.getRepository(CategoryEntity).findOne({
        where: { id: trimmed },
        withDeleted: true,
      });
      if (category) return { kind: 'category', category };

      const pageById = await this.dataSource.getRepository(PromotionalPageEntity).findOne({
        where: { id: trimmed },
        withDeleted: true,
      });
      if (pageById) return { kind: 'promotional_page', page: pageById };
    }

    const pageRepo = this.dataSource.getRepository(PromotionalPageEntity);
    const page =
      (await pageRepo.findOne({ where: { slug: trimmed }, withDeleted: true })) ??
      (await pageRepo.findOne({ where: { refId: trimmed.toUpperCase() }, withDeleted: true }));
    if (page) return { kind: 'promotional_page', page };

    throw new NotFoundException('Collection not found');
  }

  async enqueueBackfill(): Promise<{ products: number; collections: number }> {
    this.assertConfiguredEnabled();
    const [products, collections, promotionalPages] = await Promise.all([
      this.dataSource.getRepository(ProductEntity).find({
        select: { id: true },
        where: { deletedAt: IsNull() },
      }),
      this.dataSource.getRepository(CategoryEntity).find({
        select: { id: true },
        where: { deletedAt: IsNull() },
      }),
      this.dataSource.getRepository(PromotionalPageEntity).find({
        select: { id: true },
        where: { deletedAt: IsNull() },
      }),
    ]);
    await Promise.all(products.map((product) => this.queueService.enqueueProductSync(product.id)));
    await Promise.all(
      collections.map((collection) => this.queueService.enqueueCollectionSync(collection.id)),
    );
    await Promise.all(
      promotionalPages.map((page) => this.queueService.enqueueCollectionSync(page.id)),
    );
    const collectionCount = collections.length + promotionalPages.length;
    this.logger.log(
      {
        products: products.length,
        collections: collectionCount,
        promotionalPages: promotionalPages.length,
      },
      'Enqueued GoKwik catalog backfill',
    );
    return { products: products.length, collections: collectionCount };
  }

  private async pushCategoryCollection(category: CategoryEntity): Promise<void> {
    await this.collectionLock.runExclusive(async (assertOwned) => {
      await this.repository.markSyncState('collection', category.id, 'syncing');
      try {
        const isDeleted = Boolean(category.deletedAt);
        const productIds = isDeleted
          ? []
          : await this.findPublishedProductIdsForCategory(category.id);
        const payload = this.buildCollectionPayload({
          id: category.id,
          handle: category.slug,
          title: category.name,
          productIds,
          updatedAt: category.updatedAt,
          isDeleted,
        });

        this.logger.log(
          {
            categoryId: category.id,
            refId: category.refId,
            productCount: payload.product_ids.length,
            deleted: isDeleted,
          },
          'Syncing collection to GoKwik',
        );

        await assertOwned();
        await this.apiService.syncCollections(payload);
        await this.repository.markSyncState('collection', category.id, 'synced', {
          remoteId: category.id,
        });
        await this.enqueueMemberProductSyncs(payload.product_ids);
      } catch (error) {
        if (error instanceof GokwikCollectionLockBusyError) throw error;
        const message = error instanceof Error ? error.message : 'Unknown collection sync error';
        this.logger.error({ categoryId: category.id, error: message }, 'GoKwik collection sync failed');
        await this.repository.markSyncState('collection', category.id, 'failed', {
          lastError: message,
        });
        throw error;
      }
    });
  }

  private async pushPromotionalPageCollection(page: PromotionalPageEntity): Promise<void> {
    const isDeleted =
      Boolean(page.deletedAt) || !LIVE_PROMOTIONAL_STATUSES.has(page.status);
    const productIds = isDeleted ? [] : await this.findPublishedProductIdsForPromotionalPage(page.id);

    // GoKwik collection coupons fail if product_ids point at catalog rows that
    // were never synced (they look deleted). Sync members first, then the collection.
    if (!isDeleted) {
      await this.syncMemberProductsNow(productIds);
    }

    await this.collectionLock.runExclusive(async (assertOwned) => {
      await this.repository.markSyncState('collection', page.id, 'syncing');
      try {
        const payload = this.buildCollectionPayload({
          id: page.id,
          handle: page.slug,
          title: page.name,
          productIds,
          updatedAt: page.updatedAt,
          isDeleted,
        });

        this.logger.log(
          {
            promotionalPageId: page.id,
            refId: page.refId,
            slug: page.slug,
            status: page.status,
            productCount: payload.product_ids.length,
            deleted: isDeleted,
          },
          'Syncing promotional page as GoKwik collection',
        );

        await assertOwned();
        await this.apiService.syncCollections(payload);
        await this.repository.markSyncState('collection', page.id, 'synced', {
          remoteId: page.id,
        });
      } catch (error) {
        if (error instanceof GokwikCollectionLockBusyError) throw error;
        const message = error instanceof Error ? error.message : 'Unknown collection sync error';
        this.logger.error(
          { promotionalPageId: page.id, error: message },
          'GoKwik promotional collection sync failed',
        );
        await this.repository.markSyncState('collection', page.id, 'failed', {
          lastError: message,
        });
        throw error;
      }
    });

    if (!isDeleted) {
      await this.enqueueMemberProductSyncs(productIds);
    }
  }

  private buildCollectionPayload(input: {
    id: string;
    handle: string;
    title: string;
    productIds: string[];
    updatedAt?: Date;
    isDeleted: boolean;
  }): GokwikCollectionPayload {
    return {
      id: input.id,
      handle: input.handle,
      title: input.title,
      name: input.title,
      product_ids: input.productIds,
      updated_at: (input.updatedAt ?? new Date()).toISOString(),
      is_deleted: input.isDeleted,
    };
  }

  private async findPublishedProductIdsForCategory(categoryId: string): Promise<string[]> {
    const products = await this.dataSource
      .getRepository(ProductEntity)
      .createQueryBuilder('product')
      .select('product.id', 'id')
      .distinct(true)
      .where(PRODUCT_MATCHES_CATEGORY_ENTITY_SQL)
      .setParameter('categoryId', categoryId)
      .andWhere('product.deletedAt IS NULL')
      .andWhere('product.status = :published', { published: ProductStatus.PUBLISHED })
      .andWhere('product.productType IN (:...catalogProductTypes)', {
        catalogProductTypes: CATALOG_PRODUCT_TYPES,
      })
      .orderBy('product.id', 'ASC')
      .getRawMany<{ id: string }>();

    return [...new Set(products.map((row) => row.id).filter(Boolean))];
  }

  private async findPublishedProductIdsForPromotionalPage(pageId: string): Promise<string[]> {
    const products = await this.dataSource
      .getRepository(ProductEntity)
      .createQueryBuilder('product')
      .select('product.id', 'id')
      .distinct(true)
      .where('product.deletedAt IS NULL')
      .andWhere('product.status = :published', { published: ProductStatus.PUBLISHED })
      .andWhere('product.productType IN (:...catalogProductTypes)', {
        catalogProductTypes: CATALOG_PRODUCT_TYPES,
      })
      .andWhere(
        `(
          product.ref_id IN (
            SELECT t.target_ref_id FROM promotional_page_targets t
            WHERE t.promotional_page_id = :pageId AND t.target_type = :productTarget
            UNION
            SELECT item.target_ref_id
            FROM promotional_page_sections section
            INNER JOIN promotional_page_section_items item ON item.section_id = section.id
            WHERE section.promotional_page_id = :pageId AND item.target_type = :productTarget
          )
          OR product.brand_id IN (
            SELECT b.id FROM brands b
            WHERE b.ref_id IN (
              SELECT t.target_ref_id FROM promotional_page_targets t
              WHERE t.promotional_page_id = :pageId AND t.target_type = :brandTarget
              UNION
              SELECT item.target_ref_id
              FROM promotional_page_sections section
              INNER JOIN promotional_page_section_items item ON item.section_id = section.id
              WHERE section.promotional_page_id = :pageId AND item.target_type = :brandTarget
            )
          )
          OR EXISTS (
            SELECT 1 FROM categories c
            WHERE (
              product.category_id = c.id
              OR product.sub_category_id = c.id
              OR product.sub_sub_category_id = c.id
              OR product.sub_sub_sub_category_id = c.id
              OR EXISTS (
                SELECT 1 FROM product_category_hierarchies pch
                WHERE pch.product_id = product.id
                  AND (
                    pch.category_id = c.id
                    OR pch.sub_category_id = c.id
                    OR pch.sub_sub_category_id = c.id
                    OR pch.sub_sub_sub_category_id = c.id
                  )
              )
            )
            AND c.ref_id IN (
              SELECT t.target_ref_id FROM promotional_page_targets t
              WHERE t.promotional_page_id = :pageId AND t.target_type = :categoryTarget
              UNION
              SELECT item.target_ref_id
              FROM promotional_page_sections section
              INNER JOIN promotional_page_section_items item ON item.section_id = section.id
              WHERE section.promotional_page_id = :pageId AND item.target_type = :categoryTarget
            )
          )
        )`,
        {
          pageId,
          productTarget: PromotionalTargetType.PRODUCT,
          brandTarget: PromotionalTargetType.BRAND,
          categoryTarget: PromotionalTargetType.CATEGORY,
        },
      )
      .orderBy('product.id', 'ASC')
      .getRawMany<{ id: string }>();

    return [...new Set(products.map((row) => row.id).filter(Boolean))];
  }

  private async syncMemberProductsNow(productIds: string[]): Promise<void> {
    for (const productId of productIds) {
      try {
        await this.syncProduct(productId);
      } catch (error) {
        this.logger.warn(
          {
            productId,
            error: error instanceof Error ? error.message : String(error),
          },
          'GoKwik member product sync failed before collection update',
        );
      }
    }
  }

  private async enqueueMemberProductSyncs(productIds: string[]): Promise<void> {
    await Promise.all(productIds.map((productId) => this.queueService.enqueueProductSync(productId)));
  }

  private assertConfiguredEnabled(): void {
    if (!this.configService.get<boolean>('gokwik.catalogSyncEnabled')) {
      throw new ServiceUnavailableException(
        'GoKwik catalog sync is disabled. Set GOKWIK_CATALOG_SYNC_ENABLED=true',
      );
    }
    const baseUrl = this.configService.get<string>('gokwik.baseUrl');
    const appId = this.configService.get<string>('gokwik.appId');
    const appSecret = this.configService.get<string>('gokwik.appSecret');
    if (!baseUrl || !appId || !appSecret) {
      throw new ServiceUnavailableException(
        'GoKwik catalog sync is not configured (need GOKWIK_BASE_URL, GOKWIK_APP_ID, GOKWIK_APP_SECRET)',
      );
    }
  }
}
