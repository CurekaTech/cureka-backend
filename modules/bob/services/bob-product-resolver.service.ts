import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { ProductVariantsRepository } from '@modules/product/repositories/product-variants.repository';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { In, Repository } from 'typeorm';
import { bobCatalogueProductId } from '../utils/bob-product-id.util';
import { isUuid } from '../utils/bob.util';

/**
 * BOB-only identifier resolution.
 * UUID and refId win over externalProductId. A numeric string is a catalogue id
 * only when it is not already a product refId.
 * Products with no externalProductId are not BOB catalogue products.
 */
@Injectable()
export class BobProductResolver {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly productVariantsRepository: ProductVariantsRepository,
    @InjectRepository(ProductEntity)
    private readonly products: Repository<ProductEntity>,
  ) {}

  async findPublishedByBobId(identifier: string): Promise<ProductEntity | null> {
    const [product] = await this.findPublishedByBobIds([identifier]);
    return product ?? null;
  }

  /** Published, active-variant products in request order. Unknown ids are omitted. */
  async findPublishedByBobIds(identifiers: string[]): Promise<ProductEntity[]> {
    const requested = uniqueIdentifiers(identifiers);
    if (!requested.length) {
      return [];
    }

    const uuids = requested.filter(isUuid);
    const nonUuids = requested.filter((id) => !isUuid(id));

    const byUuid = uuids.length ? await this.productsRepository.findPublishedByIds(uuids) : [];
    const byRef = nonUuids.length
      ? await this.productsRepository.findPublishedByRefIds(nonUuids)
      : [];

    const matchedRefIds = new Set(byRef.map((product) => product.refId));
    const unresolved = nonUuids.filter((id) => !matchedRefIds.has(id));
    const reservedRefIds = await this.findExistingRefIds(unresolved);
    const externalCandidates = unresolved.filter((id) => !reservedRefIds.has(id));
    const byExternal = await this.findPublishedByExternalProductIds(externalCandidates);

    const byUuidMap = new Map(byUuid.map((product) => [product.id, product]));
    const byRefMap = new Map(byRef.map((product) => [product.refId, product]));
    const byExternalMap = new Map<string, ProductEntity>();
    for (const product of byExternal) {
      const catalogueId = bobCatalogueProductId(product);
      if (catalogueId) {
        byExternalMap.set(catalogueId, product);
      }
    }

    const products: ProductEntity[] = [];
    for (const id of requested) {
      const product = byUuidMap.get(id) ?? byRefMap.get(id) ?? byExternalMap.get(id);
      if (product && bobCatalogueProductId(product)) {
        products.push(product);
      }
    }
    return products;
  }

  /**
   * Internal UUID for tag updates. Includes unpublished products.
   * A refId match is never reinterpreted as another product's catalogue id.
   */
  async findIdByBobIdentifier(identifier: string): Promise<string | null> {
    const id = identifier.trim();
    if (!id) {
      return null;
    }

    if (isUuid(id)) {
      const row = await this.products.findOne({
        where: { id },
        select: ['id', 'externalProductId'],
      });
      return row && bobCatalogueProductId(row) ? row.id : null;
    }

    const byRef = await this.products.findOne({
      where: { refId: id },
      select: ['id', 'externalProductId'],
    });
    if (byRef) {
      return bobCatalogueProductId(byRef) ? byRef.id : null;
    }

    const byExternal = await this.products.findOne({
      where: { externalProductId: id },
      select: ['id', 'externalProductId'],
    });
    return byExternal && bobCatalogueProductId(byExternal) ? byExternal.id : null;
  }

  /**
   * BOB cart and GET /variants accept the variant UUID or the numeric catalogue
   * id published on products. Never query product_variants.id with a non-UUID.
   */
  async findActiveVariantByBobId(identifier: string): Promise<ProductVariantEntity | null> {
    const id = identifier.trim();
    if (!id) {
      return null;
    }

    if (isUuid(id)) {
      return this.activeVariantOrNull(await this.productVariantsRepository.findById(id));
    }

    const byExternal = await this.productVariantsRepository.findByExternalProductId(id);
    if (byExternal) {
      return this.activeVariantOrNull(byExternal);
    }

    const product = await this.findPublishedByBobId(id);
    const variants = (product?.variants ?? []).filter(
      (variant) => variant.status === VariantStatus.ACTIVE && !variant.deletedAt,
    );
    return variants.length === 1 ? variants[0] : null;
  }

  private activeVariantOrNull(
    variant: ProductVariantEntity | null,
  ): ProductVariantEntity | null {
    if (!variant?.productId || variant.status !== VariantStatus.ACTIVE || variant.deletedAt) {
      return null;
    }
    return variant;
  }

  private async findExistingRefIds(refIds: string[]): Promise<Set<string>> {
    if (!refIds.length) {
      return new Set();
    }
    const rows = await this.products.find({
      where: { refId: In(refIds) },
      select: ['refId'],
    });
    return new Set(rows.map((row) => row.refId));
  }

  private async findPublishedByExternalProductIds(
    externalIds: string[],
  ): Promise<ProductEntity[]> {
    if (!externalIds.length) {
      return [];
    }
    const rows = await this.products.find({
      where: { externalProductId: In(externalIds) },
      select: ['id', 'externalProductId'],
    });
    const ids = [...new Set(rows.map((row) => row.id))];
    if (!ids.length) {
      return [];
    }
    return this.productsRepository.findPublishedByIds(ids);
  }
}

function uniqueIdentifiers(identifiers: string[]): string[] {
  return [...new Set(identifiers.map((id) => id.trim()).filter(Boolean))];
}
