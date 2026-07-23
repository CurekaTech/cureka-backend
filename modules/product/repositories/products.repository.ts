import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
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
import { ProductStatus } from '../enums/product-status.enum';
import { VariantStatus } from '../enums/variant-status.enum';
import { DEFAULT_ADMIN_PRODUCT_LIST_SORT } from '../constants/admin-product-list-sort.constants';
import { buildSkipTake } from '@packages/database';

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
  status?: ProductStatus;
  categoryId?: string;
  brandId?: string;
  brandIds?: string[];
  productNatureId?: string;
  variantSlug?: string;
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
  brandId?: string;
  brandIds?: string[];
  productNatureId?: string;
  healthConcernId?: string;
  wellnessGoalId?: string;
  variantSlug?: string;
  tagSlug?: string;
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
    this.applyPublicListSort(qb, options.sortBy, sortOrder);
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
   * Returns the root categories that contain at least one published product carrying
   * the given tag (e.g. "bestsellers"), newest best-seller first. The category itself
   * does NOT need to be a shop-by category. Used to drive the homepage Best Sellers tabs.
   */
  async findRootCategoriesWithTag(
    tagSlug: string,
    limit: number,
  ): Promise<Array<{ id: string; refId: string; name: string; slug: string }>> {
    if (!tagSlug || limit <= 0) return [];

    const rows = await this.repo
      .createQueryBuilder('product')
      .innerJoin('product_tag_mappings', 'ptm', 'ptm.product_id = product.id')
      .innerJoin('product_tags', 'tag', 'tag.id = ptm.tag_id')
      .innerJoin('categories', 'category', 'category.id = product.category_id')
      .select('category.id', 'id')
      .addSelect('category.ref_id', 'refId')
      .addSelect('category.name', 'name')
      .addSelect('category.slug', 'slug')
      .addSelect('MAX(product.published_at)', 'latest')
      .where('product.status = :status', { status: ProductStatus.PUBLISHED })
      .andWhere('product.deleted_at IS NULL')
      .andWhere('tag.slug = :tagSlug', { tagSlug })
      .andWhere('category.deleted_at IS NULL')
      .andWhere('category.status = :categoryStatus', { categoryStatus: 'active' })
      .groupBy('category.id')
      .addGroupBy('category.ref_id')
      .addGroupBy('category.name')
      .addGroupBy('category.slug')
      .orderBy('MAX(product.published_at)', 'DESC')
      .limit(limit)
      .getRawMany<{ id: string; refId: string; name: string; slug: string }>();

    return rows.map((row) => ({
      id: row.id,
      refId: row.refId,
      name: row.name,
      slug: row.slug,
    }));
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
            AND pv.slug ILIKE :search
            AND pv.deleted_at IS NULL
        ))`,
        { search: `%${options.search}%` },
      );
    }
    if (options.productType) {
      qb.andWhere('product.productType = :productType', { productType: options.productType });
    }
    if (options.status != null) {
      qb.andWhere('product.status = :status', { status: options.status });
    }
    if (options.categoryId) {
      qb.andWhere('product.categoryId = :categoryId', { categoryId: options.categoryId });
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
  private async attachDetailRelations(products: ProductEntity[], mgr: EntityManager): Promise<void> {
    if (!products.length) return;
    const productIds = products.map((p) => p.id);

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
      mgr.getRepository(ProductMediaEntity).find({
        where: { productId: In(productIds) },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      }),
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
      qb.andWhere(
        '(product.categoryId = :categoryId OR product.subCategoryId = :categoryId OR product.subSubCategoryId = :categoryId OR product.subSubSubCategoryId = :categoryId)',
        { categoryId: options.categoryId },
      );
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
    }
    if (options.status != null) {
      qb.andWhere('product.status = :status', { status: options.status });
    }
    if (options.categoryId) {
      qb.andWhere('product.categoryId = :categoryId', { categoryId: options.categoryId });
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
            AND pv.slug ILIKE :search
            AND pv.deleted_at IS NULL
        ))`,
        { search: `%${options.search}%` },
      );
    }
    if (options.productType) {
      qb.andWhere('product.productType = :productType', { productType: options.productType });
    }
    if (options.categoryId) {
      qb.andWhere(
        '(product.categoryId = :categoryId OR product.subCategoryId = :categoryId OR product.subSubCategoryId = :categoryId OR product.subSubSubCategoryId = :categoryId)',
        { categoryId: options.categoryId },
      );
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
  ): void {
    if (sortBy === 'price') {
      qb.setParameter('variantStatus', VariantStatus.ACTIVE);
      qb.addSelect(
        `(SELECT COALESCE(MIN(pv.selling_price::numeric), 0) FROM product_variants pv WHERE pv.product_id = product.id AND pv.status = :variantStatus AND pv.deleted_at IS NULL)`,
        'min_price',
      );
      qb.orderBy('min_price', sortOrder, 'NULLS LAST');
      return;
    }

    const SORTABLE: Record<string, string> = {
      name: 'product.name',
      publishedAt: 'product.publishedAt',
    };
    const sortColumn = (sortBy && SORTABLE[sortBy]) ?? 'product.publishedAt';
    qb.orderBy(sortColumn, sortOrder, 'NULLS LAST');
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

    await this.attachDetailRelations(products, this.repo.manager);

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
          product.sub_sub_sub_category_id = $3
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
          product.sub_sub_sub_category_id = :categoryId
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
}
