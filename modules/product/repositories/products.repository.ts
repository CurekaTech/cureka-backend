import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { ProductEntity } from '../entities/product.entity';
import { ProductVariantEntity } from '../entities/product-variant.entity';
import { VariantAttributeValueEntity } from '../entities/variant-attribute-value.entity';
import { ProductMediaEntity } from '../entities/product-media.entity';
import { ProductStatus } from '../enums/product-status.enum';
import { VariantStatus } from '../enums/variant-status.enum';
import { buildSkipTake } from '@packages/database';

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
    const repository = manager ? manager.getRepository(ProductEntity) : this.repo;
    return this.applyProductDetailSelects(repository.createQueryBuilder('product'))
      .where('product.refId = :refId', { refId })
      .getOne();
  }

  async findPublishedByRefId(refId: string): Promise<ProductEntity | null> {
    return this.applyProductDetailSelects(this.repo.createQueryBuilder('product'))
      .where('product.refId = :refId', { refId })
      .andWhere('product.status = :status', { status: ProductStatus.PUBLISHED })
      .getOne();
  }

  async findPublishedBySlug(slug: string): Promise<ProductEntity | null> {
    return this.applyProductDetailSelects(this.repo.createQueryBuilder('product'))
      .where('product.slug = :slug', { slug })
      .andWhere('product.status = :status', { status: ProductStatus.PUBLISHED })
      .getOne();
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

    const [data, total] = await qb.getManyAndCount();

    if (data.length) {
      await this.attachListRelations(data);
    }

    return { data, total };
  }

  private applyProductDetailSelects(
    qb: ReturnType<Repository<ProductEntity>['createQueryBuilder']>,
  ) {
    return qb
      .leftJoinAndSelect('product.productNature', 'productNature')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.subCategory', 'subCategory')
      .leftJoinAndSelect('product.subSubCategory', 'subSubCategory')
      .leftJoinAndSelect('product.subSubSubCategory', 'subSubSubCategory')
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('product.manufacturer', 'manufacturer')
      .leftJoinAndSelect('product.packer', 'packer')
      .leftJoinAndSelect('product.importer', 'importer')
      .leftJoinAndSelect('product.countryOfOrigin', 'countryOfOrigin')
      .leftJoinAndSelect('product.attributeMappings', 'attributeMappings')
      .leftJoinAndSelect('attributeMappings.attribute', 'productAttribute')
      .leftJoinAndSelect('product.variants', 'variants')
      .leftJoinAndSelect('variants.attributeValues', 'attributeValues')
      .leftJoinAndSelect('attributeValues.attribute', 'variantAttribute')
      .leftJoinAndSelect('product.media', 'media')
      .leftJoinAndSelect('product.healthConcernMappings', 'healthConcernMappings')
      .leftJoinAndSelect('healthConcernMappings.healthConcern', 'healthConcern')
      .leftJoinAndSelect('product.wellnessGoalMappings', 'wellnessGoalMappings')
      .leftJoinAndSelect('wellnessGoalMappings.wellnessGoal', 'wellnessGoal')
      .leftJoinAndSelect('product.tagMappings', 'tagMappings')
      .leftJoinAndSelect('tagMappings.tag', 'tag')
      .leftJoinAndSelect('product.faqMappings', 'faqMappings')
      .leftJoinAndSelect('faqMappings.productFaq', 'productFaq')
      .leftJoinAndSelect('product.bundleItems', 'bundleItems')
      .leftJoinAndSelect('bundleItems.childProduct', 'childProduct')
      .orderBy('media.sortOrder', 'ASC')
      .addOrderBy('media.createdAt', 'ASC');
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

  private async attachPublicListRelations(products: ProductEntity[]): Promise<void> {
    const productIds = products.map((product) => product.id);
    const withRelations = await this.repo.find({
      where: { id: In(productIds) },
      relations: {
        productNature: true,
        category: true,
        subCategory: true,
        brand: true,
        variants: true,
        media: true,
      },
      order: {
        media: { sortOrder: 'ASC', createdAt: 'ASC' },
      },
    });

    const byId = new Map(withRelations.map((product) => [product.id, product]));
    for (const product of products) {
      const loaded = byId.get(product.id);
      if (!loaded) continue;

      product.productNature = loaded.productNature;
      product.category = loaded.category;
      product.subCategory = loaded.subCategory;
      product.brand = loaded.brand;
      product.variants = loaded.variants ?? [];
      product.media = loaded.media ?? [];
    }
  }

  /**
   * Load OneToMany relations after pagination to avoid duplicate rows skewing list counts.
   * Mirrors the relations loaded by findByRefId for a consistent list/detail response shape.
   */
  private async attachListRelations(products: ProductEntity[]): Promise<void> {
    const productIds = products.map((product) => product.id);
    const withRelations = await this.repo.find({
      where: { id: In(productIds) },
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
        attributeMappings: { attribute: true },
        variants: { attributeValues: { attribute: true } },
        media: true,
        healthConcernMappings: { healthConcern: true },
        wellnessGoalMappings: { wellnessGoal: true },
        tagMappings: { tag: true },
        faqMappings: { productFaq: true },
        bundleItems: { childProduct: true },
      },
      order: {
        media: { sortOrder: 'ASC', createdAt: 'ASC' },
      },
    });

    const byId = new Map(withRelations.map((product) => [product.id, product]));
    for (const product of products) {
      const loaded = byId.get(product.id);
      if (!loaded) continue;

      product.productNature = loaded.productNature;
      product.category = loaded.category;
      product.subCategory = loaded.subCategory;
      product.subSubCategory = loaded.subSubCategory;
      product.subSubSubCategory = loaded.subSubSubCategory;
      product.brand = loaded.brand;
      product.manufacturer = loaded.manufacturer;
      product.packer = loaded.packer;
      product.importer = loaded.importer;
      product.countryOfOrigin = loaded.countryOfOrigin;
      product.attributeMappings = loaded.attributeMappings ?? [];
      product.variants = loaded.variants ?? [];
      product.media = loaded.media ?? [];
      product.healthConcernMappings = loaded.healthConcernMappings ?? [];
      product.wellnessGoalMappings = loaded.wellnessGoalMappings ?? [];
      product.tagMappings = loaded.tagMappings ?? [];
      product.faqMappings = loaded.faqMappings ?? [];
      product.bundleItems = loaded.bundleItems ?? [];
    }
  }
}
