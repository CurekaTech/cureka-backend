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
  productNatureId?: string;
  healthConcernId?: string;
  wellnessGoalId?: string;
  variantSlug?: string;
  categoryFilterCriteria?: ProductCategoryFilterCriterion[];
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
    return (await this.repo.count({ where: { refId } })) > 0;
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
    const SORTABLE: Record<string, string> = {
      createdAt: 'product.createdAt',
      name: 'product.name',
      status: 'product.status',
      publishedAt: 'product.publishedAt',
    };
    const sortColumn = (options.sortBy && SORTABLE[options.sortBy]) ?? 'product.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.productNature', 'productNature')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.brand', 'brand')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

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
    if (options.status) {
      qb.andWhere('product.status = :status', { status: options.status });
    }
    if (options.categoryId) {
      qb.andWhere('product.categoryId = :categoryId', { categoryId: options.categoryId });
    }
    if (options.brandId) {
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
    if (options.brandId) {
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
    if (options.brandId) {
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

    const [variants, media] = await Promise.all([
      this.repo.manager.getRepository(ProductVariantEntity).find({
        where: { productId: In(productIds) },
      }),
      this.repo.manager.getRepository(ProductMediaEntity).find({
        where: { productId: In(productIds) },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
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

    for (const product of products) {
      product.variants = variantsByProduct.get(product.id) ?? [];
      product.media = mediaByProduct.get(product.id) ?? [];
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
}
