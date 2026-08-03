import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Brackets, In, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { ProductEntity } from '../entities/product.entity';
import { ProductVariantEntity } from '../entities/product-variant.entity';
import { VariantAttributeValueEntity } from '../entities/variant-attribute-value.entity';
import { ProductMediaEntity } from '../entities/product-media.entity';
import { ProductAttributeMappingEntity } from '../entities/product-attribute-mapping.entity';
import { ProductHealthConcernEntity } from '../entities/product-health-concern.entity';
import { ProductWellnessGoalEntity } from '../entities/product-wellness-goal.entity';
import { ProductTagMappingEntity } from '../entities/product-tag-mapping.entity';
import { ProductFaqMappingEntity } from '../entities/product-faq-mapping.entity';
import { ProductBundleEntity } from '../entities/product-bundle.entity';
import { ProductCategoryFilterMappingEntity } from '../entities/product-category-filter-mapping.entity';
import { ProductCategoryHierarchyEntity } from '../entities/product-category-hierarchy.entity';
import { ProductTagEntity } from '../entities/product-tag.entity';
import { ProductStatus } from '../enums/product-status.enum';
import { VariantStatus } from '../enums/variant-status.enum';
import { DEFAULT_ADMIN_PRODUCT_LIST_SORT } from '../constants/admin-product-list-sort.constants';
import { buildSkipTake } from '@packages/database';
import { PRODUCT_MATCHES_CATEGORY_ENTITY_SQL } from '../utils/product-category-hierarchies.util';

export interface ProductCategoryFilterCriterion {
  categoryFilterId: string;
  values: string[];
}

export interface ProductListOptions {
  page: number;
  limit: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  productType?: string;
  /** When set and productType is not set, exclude these types (e.g. bundles from admin product list). */
  excludeProductTypes?: string[];
  status?: ProductStatus;
  categoryId?: string;
  brandId?: string;
  brandIds?: string[];
  productNatureId?: string;
  variantSlug?: string;
  outOfStock?: boolean;
  categoryFilterCriteria?: ProductCategoryFilterCriterion[];
}

export interface PublicProductListOptions {
  page: number;
  limit: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  productType?: string;
  categoryId?: string;
  /** Match products in ANY of these categories (OR logic). Ignored when `categoryId` is set. */
  categoryIds?: string[];
  /** Exclude products by their primary IDs (e.g. already-in-cart products for YMAL). */
  excludeProductIds?: string[];
  brandId?: string;
  brandIds?: string[];
  productNatureId?: string;
  healthConcernId?: string;
  wellnessGoalId?: string;
  variantSlug?: string;
  tagSlug?: string;
  /**
   * When true, keep all filtered products but pin `bestsellers`-tagged ones first
   * (by product_tag_mappings.sort_order), then the rest.
   */
  prioritizeBestsellers?: boolean;
  categoryFilterCriteria?: ProductCategoryFilterCriterion[];
  minPrice?: number;
  maxPrice?: number;
}

@Injectable()
export class ProductsRepository {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly repo: Repository<ProductEntity>,
  ) {}

  create(data: Partial<ProductEntity>, manager?: EntityManager): Promise<ProductEntity> {
    const repository = manager ? manager.getRepository(ProductEntity) : this.repo;
    const entity = repository.create(data);
    return repository.save(entity);
  }

  async findByRefId(refId: string, manager?: EntityManager): Promise<ProductEntity | null> {
    const mgr = manager ?? this.repo.manager;
    const product = await mgr.getRepository(ProductEntity).findOne({
      where: { refId },
      relations: {
        productNature: true,
        category: true,
        subCategory: true,
        subSubCategory: true,
        subSubSubCategory: true,
        brand: true,
        manufacturer: true,
        packer: true,
        importer: true,
        countryOfOrigin: true,
      },
    });
    if (!product) return null;
    await this.attachDetailRelations([product], mgr);
    return product;
  }

  /**
   * Lightweight load for create/update mutations (skips media/faqs/tags/etc.).
   * Used by bulk upload to avoid full-detail hydration per row.
   */
  async findByRefIdForMutation(
    refId: string,
    manager?: EntityManager,
  ): Promise<ProductEntity | null> {
    const mgr = manager ?? this.repo.manager;
    const product = await mgr.getRepository(ProductEntity).findOne({
      where: { refId },
      relations: {
        productNature: true,
        category: true,
        subCategory: true,
        subSubCategory: true,
        subSubSubCategory: true,
        brand: true,
        manufacturer: true,
        packer: true,
        importer: true,
        countryOfOrigin: true,
      },
    });
    if (!product) return null;
    await this.attachMutationRelations([product], mgr);
    return product;
  }

  async findStatusByRefId(refId: string): Promise<ProductStatus | null> {
    const row = await this.repo.findOne({
      where: { refId },
      select: { status: true, refId: true },
    });
    return row?.status ?? null;
  }

  private async attachMutationRelations(
    products: ProductEntity[],
    mgr: EntityManager,
  ): Promise<void> {
    if (!products.length) return;
    const productIds = products.map((p) => p.id);

    const [attributeMappings, variants] = await Promise.all([
      mgr.getRepository(ProductAttributeMappingEntity).find({
        where: { productId: In(productIds) },
        relations: { attribute: true },
      }),
      mgr.getRepository(ProductVariantEntity).find({
        where: { productId: In(productIds) },
        relations: {
          manufacturer: true,
          packer: true,
          importer: true,
          countryOfOrigin: true,
        },
      }),
    ]);

    const categoryHierarchies = await mgr.getRepository(ProductCategoryHierarchyEntity).find({
      where: { productId: In(productIds) },
      relations: {
        category: true,
        subCategory: true,
        subSubCategory: true,
        subSubSubCategory: true,
      },
      order: { sortOrder: 'ASC' },
    });

    const variantIds = variants.map((v) => v.id);
    const attributeValues = variantIds.length
      ? await mgr.getRepository(VariantAttributeValueEntity).find({
          where: { variantId: In(variantIds) },
          relations: { attribute: true },
        })
      : [];

    const attrValuesByVariantId = new Map<string, VariantAttributeValueEntity[]>();
    for (const av of attributeValues) {
      const list = attrValuesByVariantId.get(av.variantId) ?? [];
      list.push(av);
      attrValuesByVariantId.set(av.variantId, list);
    }
    for (const variant of variants) {
      variant.attributeValues = attrValuesByVariantId.get(variant.id) ?? [];
    }

    const attrMappingsByProduct = new Map<string, ProductAttributeMappingEntity[]>();
    for (const mapping of attributeMappings) {
      const list = attrMappingsByProduct.get(mapping.productId) ?? [];
      list.push(mapping);
      attrMappingsByProduct.set(mapping.productId, list);
    }

    const variantsByProduct = new Map<string, ProductVariantEntity[]>();
    for (const variant of variants) {
      const list = variantsByProduct.get(variant.productId) ?? [];
      list.push(variant);
      variantsByProduct.set(variant.productId, list);
    }

    const hierarchiesByProduct = new Map<string, ProductCategoryHierarchyEntity[]>();
    for (const mapping of categoryHierarchies) {
      const list = hierarchiesByProduct.get(mapping.productId) ?? [];
      list.push(mapping);
      hierarchiesByProduct.set(mapping.productId, list);
    }

    for (const product of products) {
      product.attributeMappings = attrMappingsByProduct.get(product.id) ?? [];
      product.variants = variantsByProduct.get(product.id) ?? [];
      product.categoryHierarchies = hierarchiesByProduct.get(product.id) ?? [];
      product.media = [];
      product.healthConcernMappings = [];
      product.wellnessGoalMappings = [];
      product.tagMappings = [];
      product.faqMappings = [];
      product.bundleItems = [];
      product.categoryFilterMappings = [];
    }
  }

  async findAllForBulkExport(): Promise<ProductEntity[]> {
    const batchSize = 500;
    const all: ProductEntity[] = [];
    let offset = 0;

    while (true) {
      const batch = await this.findForBulkExportBatch(offset, batchSize);
      if (!batch.length) {
        break;
      }
      all.push(...batch);
      offset += batch.length;
      if (batch.length < batchSize) {
        break;
      }
    }

    return all;
  }

  async countForBulkExport(): Promise<number> {
    return this.repo.count();
  }

  async findForBulkExportBatch(offset: number, limit: number): Promise<ProductEntity[]> {
    const products = await this.repo.find({
      relations: {
        productNature: true,
        category: true,
        subCategory: true,
        subSubCategory: true,
        subSubSubCategory: true,
        brand: true,
        manufacturer: true,
        packer: true,
        importer: true,
        countryOfOrigin: true,
      },
      order: { createdAt: 'ASC' },
      skip: offset,
      take: limit,
    });

    if (!products.length) {
      return [];
    }

    await this.attachDetailRelations(products, this.repo.manager, { includeMedia: false });
    return products;
  }

  async findVariantSkuExportLookup(): Promise<
    Map<string, { mrp: number | null; sellingPrice: number | null }>
  > {
    const rows = await this.repo.manager
      .getRepository(ProductVariantEntity)
      .createQueryBuilder('variant')
      .select(['variant.sku', 'variant.mrp', 'variant.sellingPrice'])
      .where('variant.deletedAt IS NULL')
      .getMany();

    const lookup = new Map<string, { mrp: number | null; sellingPrice: number | null }>();
    for (const row of rows) {
      const sku = row.sku?.trim();
      if (!sku) continue;
      lookup.set(sku.toLowerCase(), {
        mrp: row.mrp != null ? Number(row.mrp) : null,
        sellingPrice: row.sellingPrice != null ? Number(row.sellingPrice) : null,
      });
    }
    return lookup;
  }

  async findFirstVariantSkuByProductId(): Promise<Map<string, string>> {
    const rows = await this.repo.manager.query<Array<{ product_id: string; sku: string }>>(
      `
      SELECT DISTINCT ON (product_id) product_id, sku
      FROM product_variants
      WHERE deleted_at IS NULL
      ORDER BY product_id, created_at ASC
      `,
    );

    return new Map(
      rows
        .filter((row) => row.product_id && row.sku)
        .map((row) => [row.product_id, row.sku] as const),
    );
  }

  async findPublishedByRefId(refId: string): Promise<ProductEntity | null> {
    const product = await this.repo.findOne({
      where: { refId, status: ProductStatus.PUBLISHED },
      relations: {
        productNature: true,
        category: true,
        subCategory: true,
        subSubCategory: true,
        subSubSubCategory: true,
        brand: true,
        manufacturer: true,
        packer: true,
        importer: true,
        countryOfOrigin: true,
      },
    });
    if (!product) return null;
    await this.attachDetailRelations([product], this.repo.manager);
    return product;
  }

  async findPublishedBySlug(slug: string): Promise<ProductEntity | null> {
    const product = await this.repo.findOne({
      where: { slug, status: ProductStatus.PUBLISHED },
      relations: {
        productNature: true,
        category: true,
        subCategory: true,
        subSubCategory: true,
        subSubSubCategory: true,
        brand: true,
        manufacturer: true,
        packer: true,
        importer: true,
        countryOfOrigin: true,
      },
    });
    if (!product) return null;
    await this.attachDetailRelations([product], this.repo.manager);
    return product;
  }

  async findPublishedByVariantSlug(variantSlug: string): Promise<ProductEntity | null> {
    const match = await this.repo.manager
      .getRepository(ProductVariantEntity)
      .createQueryBuilder('variant')
      .innerJoin('variant.product', 'product')
      .where('variant.slug = :variantSlug', { variantSlug })
      .andWhere('variant.deletedAt IS NULL')
      .andWhere('variant.status = :variantStatus', { variantStatus: VariantStatus.ACTIVE })
      .andWhere('product.status = :status', { status: ProductStatus.PUBLISHED })
      .select('product.refId', 'refId')
      .getRawOne<{ refId: string }>();

    if (!match?.refId) {
      return null;
    }

    return this.findPublishedByRefId(match.refId);
  }

  /**
   * Resolve a published product by variant product_page_url
   * (legacy Cureka path such as `/shop/.../product-name/`).
   * Matches with/without trailing slash and ignores surrounding whitespace.
   */
  async findPublishedByProductPageUrl(
    pageUrl: string,
  ): Promise<{ product: ProductEntity; matchedVariantId: string | null } | null> {
    const candidates = Array.from(
      new Set(
        [pageUrl, pageUrl.replace(/\/+$/, ''), pageUrl.endsWith('/') ? pageUrl : `${pageUrl}/`]
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    );
    if (!candidates.length) {
      return null;
    }

    const normalized = candidates.map((value) => value.replace(/\/+$/, '') || value);

    const match = await this.repo.manager
      .getRepository(ProductVariantEntity)
      .createQueryBuilder('variant')
      .innerJoin('variant.product', 'product')
      .where(
        `(
          variant.productPageUrl IN (:...candidates)
          OR TRIM(BOTH FROM variant.productPageUrl) IN (:...candidates)
          OR RTRIM(TRIM(BOTH FROM variant.productPageUrl), '/') IN (:...normalized)
        )`,
        { candidates, normalized },
      )
      .andWhere('variant.deletedAt IS NULL')
      .andWhere('variant.status = :variantStatus', { variantStatus: VariantStatus.ACTIVE })
      .andWhere('product.status = :status', { status: ProductStatus.PUBLISHED })
      .select('product.refId', 'refId')
      .addSelect('variant.id', 'variantId')
      .getRawOne<{ refId: string; variantId: string }>();

    if (!match?.refId) {
      return null;
    }

    const product = await this.findPublishedByRefId(match.refId);
    if (!product) {
      return null;
    }

    return { product, matchedVariantId: match.variantId ?? null };
  }

  async isSlugTakenGlobally(
    slug: string,
    exclude?: { productRefId?: string; variantId?: string },
  ): Promise<boolean> {
    const productQb = this.repo
      .createQueryBuilder('product')
      .where('product.slug = :slug', { slug });
    if (exclude?.productRefId) {
      productQb.andWhere('product.refId != :productRefId', {
        productRefId: exclude.productRefId,
      });
    }
    if (await productQb.getCount()) {
      return true;
    }

    const variantQb = this.repo.manager
      .createQueryBuilder(ProductVariantEntity, 'variant')
      .where('variant.slug = :slug', { slug });
    if (exclude?.variantId) {
      variantQb.andWhere('variant.id != :variantId', { variantId: exclude.variantId });
    }
    return (await variantQb.getCount()) > 0;
  }

  async findPublishedPaginated(
    options: PublicProductListOptions,
  ): Promise<{ data: ProductEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.productNature', 'productNature')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.subCategory', 'subCategory')
      .leftJoinAndSelect('product.subSubCategory', 'subSubCategory')
      .leftJoinAndSelect('product.subSubSubCategory', 'subSubSubCategory')
      .leftJoinAndSelect('product.brand', 'brand')
      .where('product.status = :status', { status: ProductStatus.PUBLISHED })
      .skip(skip)
      .take(take);

    this.applyPublicListFilters(qb, options);
    this.applyPublicListSort(qb, options.sortBy, sortOrder, options);
    this.applyCategoryFilterCriteria(qb, options.categoryFilterCriteria);

    const [data, total] = await qb.getManyAndCount();

    if (data.length) {
      await this.attachPublicListRelations(data);
    }

    return { data, total };
  }

  async findPublishedVariantsPaginated(
    options: PublicProductListOptions,
  ): Promise<{ data: ProductVariantEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo.manager
      .getRepository(ProductVariantEntity)
      .createQueryBuilder('variant')
      .innerJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.subCategory', 'subCategory')
      .leftJoinAndSelect('product.subSubCategory', 'subSubCategory')
      .leftJoinAndSelect('product.subSubSubCategory', 'subSubSubCategory')
      .where('variant.deletedAt IS NULL')
      .andWhere('variant.status = :variantStatus', { variantStatus: VariantStatus.ACTIVE })
      .andWhere('product.status = :status', { status: ProductStatus.PUBLISHED })
      .skip(skip)
      .take(take);

    this.applyPublicVariantSearchFilters(qb, options);
    this.applyPublicVariantSearchSort(qb, options.sortBy, sortOrder);
    this.applyCategoryFilterCriteria(qb, options.categoryFilterCriteria);

    const [data, total] = await qb.getManyAndCount();

    if (data.length) {
      await this.attachVariantSearchRelations(data);
    }

    return { data, total };
  }

  async existsByRefId(refId: string): Promise<boolean> {
    // Include soft-deleted rows — products.ref_id has a full unique constraint.
    return (
      (await this.repo
        .createQueryBuilder('product')
        .withDeleted()
        .where('product.refId = :refId', { refId })
        .getCount()) > 0
    );
  }

  /**
   * Counts, per tag slug, how many distinct (non-deleted) products in a category
   * already carry that tag. Used to cap the number of products sharing a tag within
   * a category (e.g. max N "bestSeller" products under "Skin Care").
   */
  async countProductsPerTagSlugInCategory(
    categoryId: string,
    tagSlugs: string[],
    excludeProductId: string | null,
    manager?: EntityManager,
  ): Promise<Map<string, number>> {
    if (!categoryId || !tagSlugs.length) return new Map();

    const repository = manager ? manager.getRepository(ProductEntity) : this.repo;
    const qb = repository
      .createQueryBuilder('product')
      .innerJoin('product_tag_mappings', 'ptm', 'ptm.product_id = product.id')
      .innerJoin('product_tags', 'tag', 'tag.id = ptm.tag_id')
      .select('tag.slug', 'slug')
      .addSelect('COUNT(DISTINCT product.id)', 'count')
      .where('product.categoryId = :categoryId', { categoryId })
      .andWhere('tag.slug IN (:...tagSlugs)', { tagSlugs })
      .groupBy('tag.slug');

    if (excludeProductId) {
      qb.andWhere('product.id != :excludeProductId', { excludeProductId });
    }

    const rows = await qb.getRawMany<{ slug: string; count: string }>();
    return new Map(rows.map((row) => [row.slug, parseInt(row.count, 10)]));
  }

  /**
   * Returns root categories that contain at least one product carrying the given tag
   * (e.g. "bestsellers"), ordered by bestseller_sort_index ASC NULLS LAST, then name.
   * Used by homepage Best Sellers tabs and CMS indexing.
   *
   * Uses a raw SQL query (not ProductEntity QB joins) to avoid TypeORM relation-metadata
   * crashes (`databaseName` undefined) seen on homepage sections.
   */
  async findRootCategoriesWithTag(
    tagSlug: string,
    options?: { limit?: number; publishedOnly?: boolean },
  ): Promise<
    Array<{
      id: string;
      refId: string;
      name: string;
      slug: string;
      bestsellerSortIndex: number | null;
      productCount: number;
    }>
  > {
    if (!tagSlug) return [];

    const params: unknown[] = [tagSlug];
    let publishedClause = '';
    if (options?.publishedOnly) {
      params.push(ProductStatus.PUBLISHED, 'active');
      publishedClause = `AND p.status = $2 AND c.status = $3`;
    }

    let limitClause = '';
    if (options?.limit && options.limit > 0) {
      params.push(options.limit);
      limitClause = `LIMIT $${params.length}`;
    }

    const rows = await this.repo.manager.query(
      `
      SELECT
        c.id AS id,
        c.ref_id AS "refId",
        c.name AS name,
        c.slug AS slug,
        c.bestseller_sort_index AS "bestsellerSortIndex",
        COUNT(DISTINCT p.id)::int AS "productCount"
      FROM categories c
      INNER JOIN products p
        ON p.category_id = c.id
       AND p.deleted_at IS NULL
      INNER JOIN product_tag_mappings ptm
        ON ptm.product_id = p.id
      INNER JOIN product_tags t
        ON t.id = ptm.tag_id
       AND t.slug = $1
      WHERE c.deleted_at IS NULL
        ${publishedClause}
      GROUP BY c.id, c.ref_id, c.name, c.slug, c.bestseller_sort_index
      ORDER BY c.bestseller_sort_index ASC NULLS LAST, c.name ASC
      ${limitClause}
      `,
      params,
    );

    return (rows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      refId: String(row.refId),
      name: String(row.name),
      slug: String(row.slug),
      bestsellerSortIndex:
        row.bestsellerSortIndex === null || row.bestsellerSortIndex === undefined
          ? null
          : Number(row.bestsellerSortIndex),
      productCount: Number(row.productCount) || 0,
    }));
  }

  /**
   * Published products in a category with the given tag, ordered by tag mapping sort_order.
   * Reuses findPublishedPaginated (same path as GET /public/homepage/best-sellers) to avoid
   * fragile raw join / relation metadata failures that broke homepage sections.
   */
  async findPublishedByCategoryAndTag(
    categoryId: string,
    tagSlug: string,
    limit: number,
  ): Promise<ProductEntity[]> {
    if (!categoryId || !tagSlug || limit <= 0) return [];

    const { data } = await this.findPublishedPaginated({
      page: 1,
      limit,
      categoryId,
      tagSlug,
      sortBy: 'bestsellerIndex',
      sortOrder: 'ASC',
    });
    return data;
  }

  /**
   * Admin indexing list: all products (any status) in a category with the bestsellers tag.
   */
  async findBestSellerProductsForIndexing(
    categoryId: string,
    tagSlug: string,
  ): Promise<Array<{ product: ProductEntity; sortOrder: number }>> {
    if (!categoryId || !tagSlug) return [];

    const rawRows = await this.repo
      .createQueryBuilder('product')
      .innerJoin('product_tag_mappings', 'ptm', 'ptm.product_id = product.id')
      .innerJoin('product_tags', 'tag', 'tag.id = ptm.tag_id AND tag.slug = :tagSlug', {
        tagSlug,
      })
      .addSelect('ptm.sort_order', 'mapping_sort_order')
      .where('product.category_id = :categoryId', { categoryId })
      .andWhere('product.deleted_at IS NULL')
      .orderBy('ptm.sort_order', 'ASC', 'NULLS LAST')
      .addOrderBy('product.name', 'ASC')
      .getRawAndEntities();

    const products = rawRows.entities;
    if (products.length) {
      const media = await this.repo.manager.getRepository(ProductMediaEntity).find({
        where: { productId: In(products.map((product) => product.id)) },
        order: { sortOrder: 'ASC' },
      });
      const mediaByProductId = new Map<string, ProductMediaEntity[]>();
      for (const item of media) {
        const list = mediaByProductId.get(item.productId) ?? [];
        list.push(item);
        mediaByProductId.set(item.productId, list);
      }
      for (const product of products) {
        product.media = mediaByProductId.get(product.id) ?? [];
      }
    }

    return products.map((product, index) => {
      const raw = rawRows.raw[index] as Record<string, unknown> | undefined;
      const sortOrder = Number(raw?.['mapping_sort_order'] ?? 0);
      return { product, sortOrder };
    });
  }

  async reorderBestSellerTagSortOrders(
    tagSlug: string,
    updates: Array<{ productId: string; sortOrder: number }>,
  ): Promise<void> {
    if (!updates.length) return;

    const tag = await this.repo.manager.getRepository(ProductTagEntity).findOne({
      where: { slug: tagSlug },
    });
    if (!tag) return;

    const mappingRepo = this.repo.manager.getRepository(ProductTagMappingEntity);
    await Promise.all(
      updates.map(({ productId, sortOrder }) =>
        mappingRepo.update({ productId, tagId: tag.id }, { sortOrder }),
      ),
    );
  }

  async findIdsByRefIds(
    refIds: string[],
    manager?: EntityManager,
  ): Promise<Map<string, string>> {
    if (!refIds.length) return new Map();

    const repository = manager ? manager.getRepository(ProductEntity) : this.repo;
    const rows = await repository.find({
      where: { refId: In([...new Set(refIds)]) },
      select: ['id', 'refId'],
    });

    return new Map(rows.map((row) => [row.refId, row.id]));
  }

  async updateFieldsByRefId(
    refId: string,
    data: Partial<ProductEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager ? manager.getRepository(ProductEntity) : this.repo;
    await repository.update({ refId }, data);
  }

  async existsBySlug(slug: string, excludeRefId?: string): Promise<boolean> {
    const qb = this.repo.createQueryBuilder('product').where('product.slug = :slug', { slug });
    if (excludeRefId) {
      qb.andWhere('product.refId != :excludeRefId', { excludeRefId });
    }
    return (await qb.getCount()) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<ProductEntity>,
    manager?: EntityManager,
  ): Promise<ProductEntity | null> {
    const repository = manager ? manager.getRepository(ProductEntity) : this.repo;
    await repository.update({ refId }, data);
    return this.findByRefId(refId, manager);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async restoreByRefId(refId: string): Promise<boolean> {
    const result = await this.repo.restore({ refId });
    return (result.affected ?? 0) > 0;
  }

  async findAllPaginated(
    options: ProductListOptions,
  ): Promise<{ data: ProductEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.productNature', 'productNature')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.brand', 'brand')
      .skip(skip)
      .take(take);

    this.applyAdminListSort(qb, options.sortBy, sortOrder);

    if (options.search) {
      qb.andWhere(
        `(product.name ILIKE :search OR product.slug ILIKE :search OR EXISTS (
          SELECT 1 FROM product_variants pv
          WHERE pv.product_id = product.id
            AND pv.deleted_at IS NULL
            AND (
              pv.slug ILIKE :search
              OR pv.sku ILIKE :search
              OR pv.display_name ILIKE :search
            )
        ))`,
        { search: `%${options.search}%` },
      );
    }
    if (options.productType) {
      qb.andWhere('product.productType = :productType', { productType: options.productType });
    } else if (options.excludeProductTypes?.length) {
      qb.andWhere('product.productType NOT IN (:...excludeProductTypes)', {
        excludeProductTypes: options.excludeProductTypes,
      });
    }
    if (options.status != null) {
      qb.andWhere('product.status = :status', { status: options.status });
    }
    if (options.categoryId) {
      qb.andWhere(PRODUCT_MATCHES_CATEGORY_ENTITY_SQL, { categoryId: options.categoryId });
    }
    if (options.brandIds?.length) {
      qb.andWhere('product.brandId IN (:...brandIds)', { brandIds: options.brandIds });
    } else if (options.brandId) {
      qb.andWhere('product.brandId = :brandId', { brandId: options.brandId });
    }
    if (options.productNatureId) {
      qb.andWhere('product.productNatureId = :productNatureId', {
        productNatureId: options.productNatureId,
      });
    }
    if (options.variantSlug) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM product_variants pv
          WHERE pv.product_id = product.id
            AND pv.slug = :variantSlug
            AND pv.deleted_at IS NULL
        )`,
        { variantSlug: options.variantSlug },
      );
    }

    if (options.outOfStock === true) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM product_variants pv
          WHERE pv.product_id = product.id
            AND pv.deleted_at IS NULL
            AND pv.out_of_stock = true
        )`,
      );
    } else if (options.outOfStock === false) {
      qb.andWhere(
        `NOT EXISTS (
          SELECT 1 FROM product_variants pv
          WHERE pv.product_id = product.id
            AND pv.deleted_at IS NULL
            AND pv.out_of_stock = true
        )`,
      );
    }

    this.applyCategoryFilterCriteria(qb, options.categoryFilterCriteria);

    const [data, total] = await qb.getManyAndCount();

    if (data.length) {
      await this.attachListRelations(data);
    }

    return { data, total };
  }

  async findAllVariantsPaginated(
    options: ProductListOptions,
  ): Promise<{ data: ProductVariantEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo.manager
      .getRepository(ProductVariantEntity)
      .createQueryBuilder('variant')
      .innerJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('product.productNature', 'productNature')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.brand', 'brand')
      .where('variant.deletedAt IS NULL')
      .skip(skip)
      .take(take);

    this.applyAdminVariantListFilters(qb, options);
    this.applyAdminVariantListSort(qb, options.sortBy, sortOrder);
    this.applyCategoryFilterCriteria(qb, options.categoryFilterCriteria);

    const [data, total] = await qb.getManyAndCount();

    if (data.length) {
      const uniqueProducts = [...new Map(data.map((variant) => [variant.product.id, variant.product])).values()];
      await this.attachListRelations(uniqueProducts);

      const productsById = new Map(uniqueProducts.map((product) => [product.id, product]));
      for (const variant of data) {
        const product = productsById.get(variant.productId);
        if (product) {
          variant.product = product;
        }
      }
    }

    return { data, total };
  }

  /**
   * Loads all one-to-many relations for the given products in parallel separate queries.
   * This replaces the previous single mega-JOIN which caused row multiplication and
   * 11–14 second query times (N variants × M media × K tags = enormous result set).
   *
   * Each relation is fetched with a simple WHERE product_id IN (...) query, and all
   * queries run concurrently via Promise.all, so total time = max(slowest query)
   * instead of sum(all queries).
   */
  private async attachDetailRelations(
    products: ProductEntity[],
    mgr: EntityManager,
    options?: { includeMedia?: boolean },
  ): Promise<void> {
    if (!products.length) return;
    const productIds = products.map((p) => p.id);
    const includeMedia = options?.includeMedia !== false;

    const [
      attributeMappings,
      variants,
      media,
      healthConcernMappings,
      wellnessGoalMappings,
      tagMappings,
      faqMappings,
      bundleItems,
      categoryFilterMappings,
      categoryHierarchies,
    ] = await Promise.all([
      mgr.getRepository(ProductAttributeMappingEntity).find({
        where: { productId: In(productIds) },
        relations: { attribute: true },
      }),
      mgr.getRepository(ProductVariantEntity).find({
        where: { productId: In(productIds) },
        relations: {
          manufacturer: true,
          packer: true,
          importer: true,
          countryOfOrigin: true,
        },
      }),
      includeMedia
        ? mgr.getRepository(ProductMediaEntity).find({
            where: { productId: In(productIds) },
            order: { sortOrder: 'ASC', createdAt: 'ASC' },
          })
        : Promise.resolve([] as ProductMediaEntity[]),
      mgr.getRepository(ProductHealthConcernEntity).find({
        where: { productId: In(productIds) },
        relations: { healthConcern: true },
      }),
      mgr.getRepository(ProductWellnessGoalEntity).find({
        where: { productId: In(productIds) },
        relations: { wellnessGoal: true },
      }),
      mgr.getRepository(ProductTagMappingEntity).find({
        where: { productId: In(productIds) },
        relations: { tag: true },
      }),
      mgr.getRepository(ProductFaqMappingEntity).find({
        where: { productId: In(productIds) },
        relations: { productFaq: true },
      }),
      mgr.getRepository(ProductBundleEntity).find({
        where: { parentProductId: In(productIds) },
        relations: { childProduct: true },
      }),
      mgr.getRepository(ProductCategoryFilterMappingEntity).find({
        where: { productId: In(productIds) },
        relations: { categoryFilter: true },
      }),
      mgr.getRepository(ProductCategoryHierarchyEntity).find({
        where: { productId: In(productIds) },
        relations: {
          category: true,
          subCategory: true,
          subSubCategory: true,
          subSubSubCategory: true,
        },
        order: { sortOrder: 'ASC' },
      }),
    ]);

    // Load variant attribute values in one query after variants are known
    const variantIds = variants.map((v) => v.id);
    const attributeValues = variantIds.length
      ? await mgr.getRepository(VariantAttributeValueEntity).find({
          where: { variantId: In(variantIds) },
          relations: { attribute: true },
        })
      : [];

    // Index everything by productId / variantId for O(1) assembly
    const attrValuesByVariantId = new Map<string, VariantAttributeValueEntity[]>();
    for (const av of attributeValues) {
      (attrValuesByVariantId.get(av.variantId) ?? (attrValuesByVariantId.set(av.variantId, []).get(av.variantId)!)).push(av);
    }
    for (const v of variants) {
      v.attributeValues = attrValuesByVariantId.get(v.id) ?? [];
    }

    const group = <T extends { productId: string }>(rows: T[]) => {
      const map = new Map<string, T[]>();
      for (const row of rows) {
        (map.get(row.productId) ?? (map.set(row.productId, []).get(row.productId)!)).push(row);
      }
      return map;
    };

    const attrMappingsByProduct = group(attributeMappings);
    const variantsByProduct = group(variants);
    const mediaByProduct = group(media);
    const healthByProduct = group(healthConcernMappings);
    const wellnessByProduct = group(wellnessGoalMappings);
    const tagsByProduct = group(tagMappings);
    const faqsByProduct = group(faqMappings);
    const categoryFiltersByProduct = group(categoryFilterMappings);
    const hierarchiesByProduct = group(categoryHierarchies);

    // bundleItems use parentProductId not productId
    const bundleByProduct = new Map<string, ProductBundleEntity[]>();
    for (const b of bundleItems) {
      const arr = bundleByProduct.get(b.parentProductId) ?? [];
      arr.push(b);
      bundleByProduct.set(b.parentProductId, arr);
    }

    for (const product of products) {
      product.attributeMappings = attrMappingsByProduct.get(product.id) ?? [];
      product.variants = variantsByProduct.get(product.id) ?? [];
      product.media = mediaByProduct.get(product.id) ?? [];
      product.healthConcernMappings = healthByProduct.get(product.id) ?? [];
      product.wellnessGoalMappings = wellnessByProduct.get(product.id) ?? [];
      product.tagMappings = tagsByProduct.get(product.id) ?? [];
      product.faqMappings = faqsByProduct.get(product.id) ?? [];
      product.bundleItems = bundleByProduct.get(product.id) ?? [];
      product.categoryFilterMappings = categoryFiltersByProduct.get(product.id) ?? [];
      product.categoryHierarchies = hierarchiesByProduct.get(product.id) ?? [];
    }
  }

  private applyCategoryFilterCriteria(
    qb: SelectQueryBuilder<ObjectLiteral>,
    criteria: ProductCategoryFilterCriterion[] | undefined,
  ): void {
    if (!criteria?.length) return;

    criteria.forEach((criterion, index) => {
      if (!criterion.values.length) return;

      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM product_category_filter_mappings pcfm
          WHERE pcfm.product_id = product.id
            AND pcfm.category_filter_id = :categoryFilterId_${index}
            AND pcfm.value IN (:...categoryFilterValues_${index})
        )`,
        {
          [`categoryFilterId_${index}`]: criterion.categoryFilterId,
          [`categoryFilterValues_${index}`]: criterion.values,
        },
      );
    });
  }

  private applyPublicVariantSearchFilters(
    qb: ReturnType<Repository<ProductVariantEntity>['createQueryBuilder']>,
    options: PublicProductListOptions,
  ): void {
    if (options.search) {
      qb.andWhere(
        `(product.name ILIKE :search OR product.slug ILIKE :search OR variant.slug ILIKE :search OR variant.sku ILIKE :search OR EXISTS (
          SELECT 1 FROM variant_attribute_values vav
          WHERE vav.variant_id = variant.id AND vav.value ILIKE :search
        ))`,
        { search: `%${options.search}%` },
      );
    }
    if (options.productType) {
      qb.andWhere('product.productType = :productType', { productType: options.productType });
    }
    if (options.categoryId) {
      qb.andWhere(PRODUCT_MATCHES_CATEGORY_ENTITY_SQL, { categoryId: options.categoryId });
    }
    if (options.brandIds?.length) {
      qb.andWhere('product.brandId IN (:...brandIds)', { brandIds: options.brandIds });
    } else if (options.brandId) {
      qb.andWhere('product.brandId = :brandId', { brandId: options.brandId });
    }
    if (options.productNatureId) {
      qb.andWhere('product.productNatureId = :productNatureId', {
        productNatureId: options.productNatureId,
      });
    }
    if (options.healthConcernId) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM product_health_concerns phc
          WHERE phc.product_id = product.id AND phc.health_concern_id = :healthConcernId
        )`,
        { healthConcernId: options.healthConcernId },
      );
    }
    if (options.wellnessGoalId) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM product_wellness_goals pwg
          WHERE pwg.product_id = product.id AND pwg.wellness_goal_id = :wellnessGoalId
        )`,
        { wellnessGoalId: options.wellnessGoalId },
      );
    }
    if (options.variantSlug) {
      qb.andWhere('variant.slug = :variantSlug', { variantSlug: options.variantSlug });
    }
    this.applyPublicVariantPriceRangeFilter(qb, options);
  }

  private applyPublicVariantPriceRangeFilter(
    qb: ReturnType<Repository<ProductVariantEntity>['createQueryBuilder']>,
    options: PublicProductListOptions,
  ): void {
    if (options.minPrice !== undefined) {
      qb.andWhere('variant.sellingPrice >= :minPrice', {
        minPrice: options.minPrice,
      });
    }
    if (options.maxPrice !== undefined) {
      qb.andWhere('variant.sellingPrice <= :maxPrice', {
        maxPrice: options.maxPrice,
      });
    }
  }

  private applyAdminVariantListFilters(
    qb: ReturnType<Repository<ProductVariantEntity>['createQueryBuilder']>,
    options: ProductListOptions,
  ): void {
    if (options.search) {
      qb.andWhere(
        `(product.name ILIKE :search OR product.slug ILIKE :search OR variant.slug ILIKE :search OR variant.sku ILIKE :search OR variant.display_name ILIKE :search OR EXISTS (
          SELECT 1 FROM variant_attribute_values vav
          WHERE vav.variant_id = variant.id AND vav.value ILIKE :search
        ))`,
        { search: `%${options.search}%` },
      );
    }
    if (options.productType) {
      qb.andWhere('product.productType = :productType', { productType: options.productType });
    } else if (options.excludeProductTypes?.length) {
      qb.andWhere('product.productType NOT IN (:...excludeProductTypes)', {
        excludeProductTypes: options.excludeProductTypes,
      });
    }
    if (options.status != null) {
      qb.andWhere('product.status = :status', { status: options.status });
    }
    if (options.categoryId) {
      qb.andWhere(PRODUCT_MATCHES_CATEGORY_ENTITY_SQL, { categoryId: options.categoryId });
    }
    if (options.brandIds?.length) {
      qb.andWhere('product.brandId IN (:...brandIds)', { brandIds: options.brandIds });
    } else if (options.brandId) {
      qb.andWhere('product.brandId = :brandId', { brandId: options.brandId });
    }
    if (options.productNatureId) {
      qb.andWhere('product.productNatureId = :productNatureId', {
        productNatureId: options.productNatureId,
      });
    }
    if (options.variantSlug) {
      qb.andWhere('variant.slug = :variantSlug', { variantSlug: options.variantSlug });
    }
    if (options.outOfStock === true) {
      qb.andWhere('variant.outOfStock = true');
    } else if (options.outOfStock === false) {
      qb.andWhere('variant.outOfStock = false');
    }
  }

  private applyAdminVariantListSort(
    qb: ReturnType<Repository<ProductVariantEntity>['createQueryBuilder']>,
    sortBy: string | undefined,
    sortOrder: 'ASC' | 'DESC',
  ): void {
    switch (sortBy) {
      case 'price':
        qb.orderBy('variant.sellingPrice', sortOrder, 'NULLS LAST');
        return;
      case 'stock':
        qb.orderBy('variant.stock', sortOrder, 'NULLS LAST');
        return;
      case 'sku':
        qb.orderBy('variant.sku', sortOrder, 'NULLS LAST');
        return;
      default: {
        const SORTABLE: Record<string, string> = {
          refId: 'product.refId',
          name: 'product.name',
          slug: 'variant.slug',
          productType: 'product.productType',
          status: 'product.status',
          publishedAt: 'product.publishedAt',
          createdAt: 'product.createdAt',
          updatedAt: 'product.updatedAt',
          categoryName: 'category.name',
          brandName: 'brand.name',
          productNatureName: 'productNature.name',
        };
        const resolvedSortBy = sortBy ?? DEFAULT_ADMIN_PRODUCT_LIST_SORT;
        const sortColumn = SORTABLE[resolvedSortBy] ?? SORTABLE[DEFAULT_ADMIN_PRODUCT_LIST_SORT];
        qb.orderBy(sortColumn, sortOrder, 'NULLS LAST');
      }
    }
  }

  private applyAdminListSort(
    qb: SelectQueryBuilder<ProductEntity>,
    sortBy: string | undefined,
    sortOrder: 'ASC' | 'DESC',
  ): void {
    switch (sortBy) {
      case 'price':
        qb.addSelect(
          `(SELECT COALESCE(MIN(pv.selling_price::numeric), 0) FROM product_variants pv WHERE pv.product_id = product.id AND pv.deleted_at IS NULL)`,
          'admin_sort_price',
        );
        qb.orderBy('admin_sort_price', sortOrder, 'NULLS LAST');
        return;
      case 'stock':
        qb.addSelect(
          `(SELECT COALESCE(SUM(pv.stock), 0) FROM product_variants pv WHERE pv.product_id = product.id AND pv.deleted_at IS NULL)`,
          'admin_sort_stock',
        );
        qb.orderBy('admin_sort_stock', sortOrder, 'NULLS LAST');
        return;
      case 'sku':
        qb.addSelect(
          `(SELECT MIN(pv.sku) FROM product_variants pv WHERE pv.product_id = product.id AND pv.deleted_at IS NULL)`,
          'admin_sort_sku',
        );
        qb.orderBy('admin_sort_sku', sortOrder, 'NULLS LAST');
        return;
      default: {
        const SORTABLE: Record<string, string> = {
          refId: 'product.refId',
          name: 'product.name',
          slug: 'product.slug',
          productType: 'product.productType',
          status: 'product.status',
          publishedAt: 'product.publishedAt',
          createdAt: 'product.createdAt',
          updatedAt: 'product.updatedAt',
          categoryName: 'category.name',
          brandName: 'brand.name',
          productNatureName: 'productNature.name',
        };
        const resolvedSortBy = sortBy ?? DEFAULT_ADMIN_PRODUCT_LIST_SORT;
        const sortColumn = SORTABLE[resolvedSortBy] ?? SORTABLE[DEFAULT_ADMIN_PRODUCT_LIST_SORT];
        qb.orderBy(sortColumn, sortOrder, 'NULLS LAST');
      }
    }
  }

  private applyPublicVariantSearchSort(
    qb: ReturnType<Repository<ProductVariantEntity>['createQueryBuilder']>,
    sortBy: string | undefined,
    sortOrder: 'ASC' | 'DESC',
  ): void {
    const SORTABLE: Record<string, string> = {
      name: 'product.name',
      publishedAt: 'product.publishedAt',
      price: 'variant.sellingPrice',
      variantSlug: 'variant.slug',
    };
    const sortColumn = (sortBy && SORTABLE[sortBy]) ?? 'product.publishedAt';
    qb.orderBy(sortColumn, sortOrder, 'NULLS LAST');
  }

  private async attachVariantSearchRelations(variants: ProductVariantEntity[]): Promise<void> {
    const variantIds = variants.map((variant) => variant.id);
    const productIds = [...new Set(variants.map((variant) => variant.productId))];

    const [attributeRows, mediaRows] = await Promise.all([
      this.repo.manager.getRepository(VariantAttributeValueEntity).find({
        where: { variantId: In(variantIds) },
        relations: { attribute: true },
      }),
      this.repo.manager.getRepository(ProductMediaEntity).find({
        where: { productId: In(productIds) },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      }),
    ]);

    const attrsByVariantId = new Map<string, VariantAttributeValueEntity[]>();
    for (const row of attributeRows) {
      const existing = attrsByVariantId.get(row.variantId) ?? [];
      existing.push(row);
      attrsByVariantId.set(row.variantId, existing);
    }

    const mediaByProductId = new Map<string, ProductMediaEntity[]>();
    for (const row of mediaRows) {
      const existing = mediaByProductId.get(row.productId) ?? [];
      existing.push(row);
      mediaByProductId.set(row.productId, existing);
    }

    for (const variant of variants) {
      variant.attributeValues = attrsByVariantId.get(variant.id) ?? [];
      variant.product.media = mediaByProductId.get(variant.productId) ?? [];
    }
  }

  private applyPublicListFilters(
    qb: ReturnType<Repository<ProductEntity>['createQueryBuilder']>,
    options: PublicProductListOptions,
  ): void {
    if (options.search) {
      qb.andWhere(
        `(product.name ILIKE :search OR product.slug ILIKE :search OR EXISTS (
          SELECT 1 FROM product_variants pv
          WHERE pv.product_id = product.id
            AND pv.deleted_at IS NULL
            AND (
              pv.slug ILIKE :search
              OR pv.sku ILIKE :search
              OR pv.display_name ILIKE :search
            )
        ))`,
        { search: `%${options.search}%` },
      );
    }
    if (options.productType) {
      qb.andWhere('product.productType = :productType', { productType: options.productType });
    }
    if (options.categoryId) {
      qb.andWhere(PRODUCT_MATCHES_CATEGORY_ENTITY_SQL, { categoryId: options.categoryId });
    } else if (options.categoryIds?.length) {
      if (options.categoryIds.length === 1) {
        qb.andWhere(PRODUCT_MATCHES_CATEGORY_ENTITY_SQL, { categoryId: options.categoryIds[0] });
      } else {
        // Build an OR across all category IDs using uniquely named parameters per slot
        const params: Record<string, string> = {};
        options.categoryIds.forEach((id, i) => {
          params[`ymalCatId${i}`] = id;
        });
        qb.andWhere(
          new Brackets((sub) => {
            options.categoryIds!.forEach((_, i) => {
              const clause = PRODUCT_MATCHES_CATEGORY_ENTITY_SQL.replace(
                /:categoryId/g,
                `:ymalCatId${i}`,
              );
              if (i === 0) {
                sub.where(clause);
              } else {
                sub.orWhere(clause);
              }
            });
          }),
          params,
        );
      }
    }
    if (options.excludeProductIds?.length) {
      qb.andWhere('product.id NOT IN (:...excludeProductIds)', {
        excludeProductIds: options.excludeProductIds,
      });
    }
    if (options.brandIds?.length) {
      qb.andWhere('product.brandId IN (:...brandIds)', { brandIds: options.brandIds });
    } else if (options.brandId) {
      qb.andWhere('product.brandId = :brandId', { brandId: options.brandId });
    }
    if (options.productNatureId) {
      qb.andWhere('product.productNatureId = :productNatureId', {
        productNatureId: options.productNatureId,
      });
    }
    if (options.healthConcernId) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM product_health_concerns phc
          WHERE phc.product_id = product.id AND phc.health_concern_id = :healthConcernId
        )`,
        { healthConcernId: options.healthConcernId },
      );
    }
    if (options.wellnessGoalId) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM product_wellness_goals pwg
          WHERE pwg.product_id = product.id AND pwg.wellness_goal_id = :wellnessGoalId
        )`,
        { wellnessGoalId: options.wellnessGoalId },
      );
    }
    if (options.variantSlug) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM product_variants pv
          WHERE pv.product_id = product.id
            AND pv.slug = :variantSlug
            AND pv.deleted_at IS NULL
        )`,
        { variantSlug: options.variantSlug },
      );
    }
    if (options.tagSlug) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM product_tag_mappings ptm
          INNER JOIN product_tags tag ON tag.id = ptm.tag_id
          WHERE ptm.product_id = product.id AND tag.slug = :tagSlug
        )`,
        { tagSlug: options.tagSlug },
      );
    }
    this.applyPublicPriceRangeFilter(qb, options, 'product');
  }

  private applyPublicPriceRangeFilter(
    qb: SelectQueryBuilder<ObjectLiteral>,
    options: PublicProductListOptions,
    productAlias: string,
  ): void {
    if (options.minPrice === undefined && options.maxPrice === undefined) {
      return;
    }

    qb.setParameter('priceVariantStatus', VariantStatus.ACTIVE);

    const conditions = [
      `pv.product_id = ${productAlias}.id`,
      'pv.deleted_at IS NULL',
      'pv.status = :priceVariantStatus',
    ];

    if (options.minPrice !== undefined) {
      conditions.push('pv.selling_price::numeric >= :minPrice');
      qb.setParameter('minPrice', options.minPrice);
    }
    if (options.maxPrice !== undefined) {
      conditions.push('pv.selling_price::numeric <= :maxPrice');
      qb.setParameter('maxPrice', options.maxPrice);
    }

    qb.andWhere(
      `EXISTS (SELECT 1 FROM product_variants pv WHERE ${conditions.join(' AND ')})`,
    );
  }

  private applyPublicListSort(
    qb: ReturnType<Repository<ProductEntity>['createQueryBuilder']>,
    sortBy: string | undefined,
    sortOrder: 'ASC' | 'DESC',
    options?: Pick<PublicProductListOptions, 'tagSlug' | 'prioritizeBestsellers'>,
  ): void {
    const bestsellerTagSlug = options?.prioritizeBestsellers
      ? 'bestsellers'
      : sortBy === 'bestsellerIndex'
        ? options?.tagSlug
        : undefined;

    if (bestsellerTagSlug) {
      qb.setParameter('bestsellerSortTagSlug', bestsellerTagSlug);
      qb.addSelect(
        `(CASE WHEN EXISTS (
            SELECT 1 FROM product_tag_mappings ptm_bs
            INNER JOIN product_tags t_bs ON t_bs.id = ptm_bs.tag_id
            WHERE ptm_bs.product_id = product.id AND t_bs.slug = :bestsellerSortTagSlug
          ) THEN 0 ELSE 1 END)`,
        'bestseller_rank',
      );
      qb.addSelect(
        `(SELECT ptm.sort_order FROM product_tag_mappings ptm
          INNER JOIN product_tags t ON t.id = ptm.tag_id
          WHERE ptm.product_id = product.id AND t.slug = :bestsellerSortTagSlug
          LIMIT 1)`,
        'bestseller_sort_order',
      );
      qb.orderBy('bestseller_rank', 'ASC');
      qb.addOrderBy('bestseller_sort_order', 'ASC', 'NULLS LAST');
    }

    if (sortBy === 'bestsellerIndex' && options?.tagSlug && !options?.prioritizeBestsellers) {
      // Bestsellers-only listing: index already applied above; tie-break by publishedAt.
      qb.addOrderBy('product.publishedAt', 'DESC', 'NULLS LAST');
      return;
    }

    if (sortBy === 'price') {
      qb.setParameter('variantStatus', VariantStatus.ACTIVE);
      qb.addSelect(
        `(SELECT COALESCE(MIN(pv.selling_price::numeric), 0) FROM product_variants pv WHERE pv.product_id = product.id AND pv.status = :variantStatus AND pv.deleted_at IS NULL)`,
        'min_price',
      );
      if (options?.prioritizeBestsellers) {
        qb.addOrderBy('min_price', sortOrder, 'NULLS LAST');
      } else {
      qb.orderBy('min_price', sortOrder, 'NULLS LAST');
      }
      return;
    }

    const SORTABLE: Record<string, string> = {
      name: 'product.name',
      publishedAt: 'product.publishedAt',
    };
    const sortColumn =
      sortBy === 'bestsellerIndex'
        ? 'product.publishedAt'
        : (sortBy && SORTABLE[sortBy]) ?? 'product.publishedAt';
    const secondaryOrder = sortBy === 'bestsellerIndex' ? 'DESC' : sortOrder;

    if (options?.prioritizeBestsellers || (sortBy === 'bestsellerIndex' && options?.tagSlug)) {
      qb.addOrderBy(sortColumn, secondaryOrder, 'NULLS LAST');
      return;
    }

    qb.orderBy(sortColumn, secondaryOrder, 'NULLS LAST');
  }

  /**
   * For public product cards, scalar relations (category, brand, etc.) are already
   * loaded by the paginated query's leftJoinAndSelect. This method only loads the
   * one-to-many relations (variants for pricing, media for the primary image)
   * using parallel queries to avoid sequential TypeORM relation loading.
   */
  private async attachPublicListRelations(products: ProductEntity[]): Promise<void> {
    const productIds = products.map((p) => p.id);

    const [variants, media, tagMappings] = await Promise.all([
      this.repo.manager.getRepository(ProductVariantEntity).find({
        where: { productId: In(productIds) },
      }),
      this.repo.manager.getRepository(ProductMediaEntity).find({
        where: { productId: In(productIds) },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      }),
      this.repo.manager.getRepository(ProductTagMappingEntity).find({
        where: { productId: In(productIds) },
        relations: { tag: true },
      }),
    ]);

    const variantsByProduct = new Map<string, ProductVariantEntity[]>();
    for (const v of variants) {
      (variantsByProduct.get(v.productId) ?? (variantsByProduct.set(v.productId, []).get(v.productId)!)).push(v);
    }

    const mediaByProduct = new Map<string, ProductMediaEntity[]>();
    for (const m of media) {
      (mediaByProduct.get(m.productId) ?? (mediaByProduct.set(m.productId, []).get(m.productId)!)).push(m);
    }

    const tagsByProduct = new Map<string, ProductTagMappingEntity[]>();
    for (const mapping of tagMappings) {
      (tagsByProduct.get(mapping.productId) ?? (tagsByProduct.set(mapping.productId, []).get(mapping.productId)!)).push(mapping);
    }

    for (const product of products) {
      product.variants = variantsByProduct.get(product.id) ?? [];
      product.media = mediaByProduct.get(product.id) ?? [];
      product.tagMappings = tagsByProduct.get(product.id) ?? [];
    }
  }

  /**
   * Load OneToMany relations after pagination using parallel queries.
   * Same strategy as attachDetailRelations — avoids the nested find() which
   * TypeORM resolves sequentially, one query per relation level.
   */
  private async attachListRelations(products: ProductEntity[]): Promise<void> {
    await this.attachDetailRelations(products, this.repo.manager);
  }

  /** Published (live) products with at least one active, non-deleted variant — for Unicommerce catalog sync. */
  async countPublishedActiveVariants(): Promise<number> {
    return this.repo.manager
      .getRepository(ProductVariantEntity)
      .createQueryBuilder('variant')
      .innerJoin('variant.product', 'product')
      .where('variant.deletedAt IS NULL')
      .andWhere('variant.status = :variantStatus', { variantStatus: VariantStatus.ACTIVE })
      .andWhere('product.status = :status', { status: ProductStatus.PUBLISHED })
      .andWhere('product.publishedAt IS NOT NULL')
      .getCount();
  }

  /** All refIds of published products with at least one active variant — used for bulk UC push. */
  async findAllPublishedRefIds(): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('product')
      .select('product.refId', 'refId')
      .where('product.status = :status', { status: ProductStatus.PUBLISHED })
      .andWhere('product.publishedAt IS NOT NULL')
      .andWhere(
        `EXISTS (
          SELECT 1 FROM product_variants pv
          WHERE pv.product_id = product.id
            AND pv.deleted_at IS NULL
            AND pv.status = :variantStatus
        )`,
        { variantStatus: VariantStatus.ACTIVE },
      )
      .orderBy('product.publishedAt', 'DESC')
      .getRawMany<{ refId: string }>();

    return rows.map((row) => row.refId);
  }

  /** Only live marketplace catalog: published products with active variants (not draft/inactive/archived). */
  async findPublishedProductsForUnicommerce(options: {
    page: number;
    pageSize: number;
    skus?: string[];
  }): Promise<ProductEntity[]> {
    const { skip, take } = buildSkipTake(options.page, options.pageSize);

    const qb = this.repo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.brand', 'brand')
      .where('product.status = :status', { status: ProductStatus.PUBLISHED })
      .andWhere('product.publishedAt IS NOT NULL')
      .andWhere(
        `EXISTS (
          SELECT 1 FROM product_variants pv
          WHERE pv.product_id = product.id
            AND pv.deleted_at IS NULL
            AND pv.status = :variantStatus
        )`,
        { variantStatus: VariantStatus.ACTIVE },
      )
      .orderBy('product.publishedAt', 'DESC', 'NULLS LAST')
      .skip(skip)
      .take(take);

    if (options.skus?.length) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM product_variants pv
          WHERE pv.product_id = product.id
            AND pv.deleted_at IS NULL
            AND pv.status = :variantStatus
            AND pv.sku IN (:...skus)
        )`,
        { skus: options.skus, variantStatus: VariantStatus.ACTIVE },
      );
    }

    const data = await qb.getMany();
    if (!data.length) {
      return [];
    }

    await this.attachDetailRelations(data, this.repo.manager);

    for (const product of data) {
      product.variants = (product.variants ?? []).filter(
        (variant) =>
          !variant.deletedAt &&
          variant.status === VariantStatus.ACTIVE &&
          (!options.skus?.length || options.skus.includes(variant.sku)),
      );
    }

    return data.filter((product) => product.variants.length > 0);
  }

  async findPublishedProductsForSearch(options: {
    page: number;
    pageSize: number;
  }): Promise<ProductEntity[]> {
    const { skip, take } = buildSkipTake(options.page, options.pageSize);

    const qb = this.repo
      .createQueryBuilder('product')
      .leftJoin('product.brand', 'brand')
      .addSelect(['brand.id', 'brand.name'])
      .leftJoin('product.category', 'category')
      .addSelect(['category.id', 'category.name'])
      .where('product.status = :status', { status: ProductStatus.PUBLISHED })
      .andWhere(
        `EXISTS (
          SELECT 1 FROM product_variants pv
          WHERE pv.product_id = product.id
            AND pv.deleted_at IS NULL
            AND pv.status = :variantStatus
        )`,
        { variantStatus: VariantStatus.ACTIVE },
      )
      .orderBy('product.publishedAt', 'DESC', 'NULLS LAST')
      .skip(skip)
      .take(take);

    const data = await qb.getMany();
    if (!data.length) {
      return [];
    }

    await this.attachDetailRelations(data, this.repo.manager);

    for (const product of data) {
      product.variants = (product.variants ?? []).filter(
        (variant) => !variant.deletedAt && variant.status === VariantStatus.ACTIVE,
      );
    }

    return data.filter((product) => product.variants.length > 0);
  }

  async findPublishedByRefIds(refIds: string[]): Promise<ProductEntity[]> {
    if (!refIds.length) {
      return [];
    }

    const products = await this.repo.find({
      where: { refId: In(refIds), status: ProductStatus.PUBLISHED },
      relations: {
        productNature: true,
        category: true,
        subCategory: true,
        subSubCategory: true,
        subSubSubCategory: true,
        brand: true,
      },
    });

    if (!products.length) {
      return [];
    }

    // Card/list callers only — avoid attachDetailRelations (heavy + hierarchy joins).
    await this.attachPublicListRelations(products);

    for (const product of products) {
      product.variants = (product.variants ?? []).filter(
        (variant) => !variant.deletedAt && variant.status === VariantStatus.ACTIVE,
      );
    }

    const productByRefId = new Map(products.map((product) => [product.refId, product]));
    return refIds
      .map((refId) => productByRefId.get(refId))
      .filter((product): product is ProductEntity => Boolean(product?.variants.length));
  }

  async findPublishedById(id: string): Promise<ProductEntity | null> {
    const products = await this.findPublishedByIds([id]);
    return products[0] ?? null;
  }

  async findPublishedByIds(ids: string[]): Promise<ProductEntity[]> {
    if (!ids.length) {
      return [];
    }

    const products = await this.repo.find({
      where: { id: In(ids), status: ProductStatus.PUBLISHED },
      relations: {
        productNature: true,
        category: true,
        subCategory: true,
        subSubCategory: true,
        subSubSubCategory: true,
        brand: true,
      },
    });

    if (!products.length) {
      return [];
    }

    await this.attachDetailRelations(products, this.repo.manager);

    for (const product of products) {
      product.variants = (product.variants ?? []).filter(
        (variant) => !variant.deletedAt && variant.status === VariantStatus.ACTIVE,
      );
    }

    const productById = new Map(products.map((product) => [product.id, product]));
    return ids
      .map((id) => productById.get(id))
      .filter((product): product is ProductEntity => Boolean(product?.variants.length));
  }

  /** Lightweight published products for wishlist/list cards (no PDP relations). */
  async findPublishedListByIds(ids: string[]): Promise<ProductEntity[]> {
    if (!ids.length) {
      return [];
    }

    const products = await this.repo.find({
      where: { id: In(ids), status: ProductStatus.PUBLISHED },
      relations: {
        productNature: true,
        category: true,
        subCategory: true,
        brand: true,
      },
    });

    if (!products.length) {
      return [];
    }

    await this.attachPublicListRelations(products);

    for (const product of products) {
      product.variants = (product.variants ?? []).filter(
        (variant) => !variant.deletedAt && variant.status === VariantStatus.ACTIVE,
      );
    }

    const productById = new Map(products.map((product) => [product.id, product]));
    return ids
      .map((id) => productById.get(id))
      .filter((product): product is ProductEntity => Boolean(product?.variants.length));
  }

  async existsPublishedById(id: string): Promise<boolean> {
    const count = await this.repo
      .createQueryBuilder('product')
      .where('product.id = :id', { id })
      .andWhere('product.status = :status', { status: ProductStatus.PUBLISHED })
      .andWhere(
        `EXISTS (
          SELECT 1 FROM product_variants pv
          WHERE pv.product_id = product.id
            AND pv.deleted_at IS NULL
            AND pv.status = :variantStatus
        )`,
        { variantStatus: VariantStatus.ACTIVE },
      )
      .getCount();

    return count > 0;
  }

  async findPublishedRefIdsByBrandId(brandId: string): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('product')
      .select('product.refId', 'refId')
      .where('product.status = :status', { status: ProductStatus.PUBLISHED })
      .andWhere('product.brandId = :brandId', { brandId })
      .andWhere(
        `EXISTS (
          SELECT 1 FROM product_variants pv
          WHERE pv.product_id = product.id
            AND pv.deleted_at IS NULL
            AND pv.status = :variantStatus
        )`,
        { variantStatus: VariantStatus.ACTIVE },
      )
      .getRawMany<{ refId: string }>();

    return rows.map((row) => row.refId);
  }

  /**
   * Distinct category-filter values used by published products within a category listing
   * scope (matches any hierarchy level on the product).
   */
  async findCategoryFilterFacetValues(
    categoryId: string,
    categoryFilterIds: string[],
  ): Promise<Array<{ categoryFilterId: string; value: string }>> {
    if (!categoryFilterIds.length) {
      return [];
    }

    return this.repo.manager.query<Array<{ categoryFilterId: string; value: string }>>(
      `
      SELECT DISTINCT
        pcfm.category_filter_id AS "categoryFilterId",
        pcfm.value AS value
      FROM product_category_filter_mappings pcfm
      INNER JOIN products product ON product.id = pcfm.product_id
      WHERE product.status = $2
        AND product.deleted_at IS NULL
        AND pcfm.category_filter_id = ANY($1::uuid[])
        AND (
          product.category_id = $3 OR
          product.sub_category_id = $3 OR
          product.sub_sub_category_id = $3 OR
          product.sub_sub_sub_category_id = $3 OR
          EXISTS (
            SELECT 1 FROM product_category_hierarchies pch
            WHERE pch.product_id = product.id
              AND (
                pch.category_id = $3 OR
                pch.sub_category_id = $3 OR
                pch.sub_sub_category_id = $3 OR
                pch.sub_sub_sub_category_id = $3
              )
          )
        )
      ORDER BY pcfm.value ASC
      `,
      [categoryFilterIds, ProductStatus.PUBLISHED, categoryId],
    );
  }

  async findPublishedRefIdsByCategoryId(categoryId: string): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('product')
      .select('product.refId', 'refId')
      .where('product.status = :status', { status: ProductStatus.PUBLISHED })
      .andWhere(
        `(
          product.category_id = :categoryId OR
          product.sub_category_id = :categoryId OR
          product.sub_sub_category_id = :categoryId OR
          product.sub_sub_sub_category_id = :categoryId OR
          EXISTS (
            SELECT 1 FROM product_category_hierarchies pch
            WHERE pch.product_id = product.id
              AND (
                pch.category_id = :categoryId OR
                pch.sub_category_id = :categoryId OR
                pch.sub_sub_category_id = :categoryId OR
                pch.sub_sub_sub_category_id = :categoryId
              )
          )
        )`,
        { categoryId },
      )
      .andWhere(
        `EXISTS (
          SELECT 1 FROM product_variants pv
          WHERE pv.product_id = product.id
            AND pv.deleted_at IS NULL
            AND pv.status = :variantStatus
        )`,
        { variantStatus: VariantStatus.ACTIVE },
      )
      .getRawMany<{ refId: string }>();

    return rows.map((row) => row.refId);
  }

  /**
   * Look up product + category + price information for a list of variant UUIDs.
   * Used by the "You May Also Like" API to derive similarity dimensions from cart items.
   */
  async findVariantInfoByIds(variantIds: string[]): Promise<
    Array<{
      variantId: string;
      productId: string;
      categoryId: string | null;
      subCategoryId: string | null;
      sellingPrice: number;
    }>
  > {
    if (!variantIds.length) return [];

    const rows = await this.repo.manager.query<
      Array<{
        variantId: string;
        productId: string;
        categoryId: string | null;
        subCategoryId: string | null;
        sellingPrice: string;
      }>
    >(
      `
      SELECT
        pv.id                     AS "variantId",
        pv.product_id             AS "productId",
        p.category_id             AS "categoryId",
        p.sub_category_id         AS "subCategoryId",
        pv.selling_price::numeric AS "sellingPrice"
      FROM product_variants pv
      INNER JOIN products p ON p.id = pv.product_id
      WHERE pv.id = ANY($1)
        AND pv.deleted_at IS NULL
        AND p.deleted_at IS NULL
      `,
      [variantIds],
    );

    return rows.map((row) => ({
      variantId: row.variantId,
      productId: row.productId,
      categoryId: row.categoryId,
      subCategoryId: row.subCategoryId,
      sellingPrice: Number(row.sellingPrice) || 0,
    }));
  }
}

