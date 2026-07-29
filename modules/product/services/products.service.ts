import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import {
  buildQueryCacheHash,
  CacheKeys,
  CacheModuleName,
  CacheStrategyService,
} from '@packages/cache';
import { EVENTS, ProductUpdatedEvent } from '@packages/events';
import { FastifyRequest } from 'fastify';
import { CreateProductDto, ProductQueryDto, UpdateProductDto, UpdateProductStatusDto, BulkMarkOutOfStockDto, BulkRestoreStockDto } from '../dto/product.dto';
import { RejectProductDto } from '../dto/reject-product.dto';
import { IProduct } from '../interfaces/product.interface';
import { IBulkMarkOutOfStockResult } from '../interfaces/bulk-mark-out-of-stock.interface';
import { enrichProductInformation } from '../utils/product-information.util';
import { mapSpecificationFields } from '../utils/product-payload.util';
import { collectProductMedia, hasVariantMediaInPayload } from '../utils/product-media.util';
import { validateVariantAttributeScope } from '../validators/variant.validator';
import {
  ensureBundlePricingVariants,
  normalizeBundleCreateDto,
  resolveBundleChildItems,
} from '../utils/bundle-product.util';
import { ProductsRepository } from '../repositories/products.repository';
import { ProductRelationsRepository } from '../repositories/product-relations.repository';
import { ProductVariantsRepository } from '../repositories/product-variants.repository';
import { ProductInformationLabelsRepository } from '../repositories/product-information-labels.repository';
import { ProductMasterResolverService } from './product-master-resolver.service';
import { ProductStrategyFactory } from '../strategies/product-strategies';
import { mapProductEntityToDetailResponse, mapProductEntityToResponse, mapProductEntityToVariantListItem } from '../mappers/product.mapper';
import { IProductDetail } from '../interfaces/product-detail.interface';
import { generateProductSlug, assertProductUrlSlugLength, generateTagSlug } from '../utils/product-slug.util';
import { ProductStatus } from '../enums/product-status.enum';
import { ProductEntity } from '../entities/product.entity';
import { ProductVariantEntity } from '../entities/product-variant.entity';
import { VariantAttributeValueEntity } from '../entities/variant-attribute-value.entity';
import { ProductType } from '../enums/product-type.enum';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { BrandsRepository } from '@modules/master/repositories/brands.repository';
import { ProductNaturesRepository } from '@modules/master/repositories/product-natures.repository';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { ProductMultipartService } from './product-multipart.service';
import { parseCategoryFilterQueryBindings } from '../utils/category-filter-query.util';
import { dtoHasCategoryHierarchyChanges } from '../utils/product-category-hierarchies.util';

/** Max products in a single category that may share the same tag (e.g. "bestSeller"). */
const MAX_PRODUCTS_PER_CATEGORY_TAG = 10;

export interface ProductMutationOptions {
  /** Skip signed-URL enrichment on the returned payload (bulk upload path). */
  skipDetailEnrichment?: boolean;
  /** Use a lighter product load (no media/faqs/tags hydration). */
  lightweightLoad?: boolean;
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly productsRepository: ProductsRepository,
    private readonly relationsRepository: ProductRelationsRepository,
    private readonly variantsRepository: ProductVariantsRepository,
    private readonly masterResolver: ProductMasterResolverService,
    private readonly strategyFactory: ProductStrategyFactory,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly eventEmitter: EventEmitter2,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly brandsRepository: BrandsRepository,
    private readonly productNaturesRepository: ProductNaturesRepository,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly productMultipartService: ProductMultipartService,
    private readonly productInformationLabelsRepository: ProductInformationLabelsRepository,
  ) { }

  async createFromRequest(req: FastifyRequest, createdBy: string): Promise<IProduct> {
    try {
      const dto = await this.productMultipartService.parseCreateProduct(req);
      return await this.createDraft(dto, createdBy);
    } catch (error) {
      this.logProductCreateFailure('multipart', error);
      throw error;
    }
  }

  async createBundleFromRequest(req: FastifyRequest, createdBy: string): Promise<IProduct> {
    try {
      const dto = await this.productMultipartService.parseCreateProduct(req);
      dto.productType = ProductType.BUNDLE;
      return await this.createDraft(dto, createdBy);
    } catch (error) {
      this.logProductCreateFailure('multipart', error);
      throw error;
    }
  }

  async createBundleFromJsonBody(body: unknown, createdBy: string): Promise<IProduct> {
    const dto = {
      ...(body as object),
      productType: ProductType.BUNDLE,
    };
    return this.createFromJsonBody(dto, createdBy);
  }

  async updateBundleFromRequest(
    req: FastifyRequest,
    refId: string,
    updatedBy: string,
  ): Promise<IProduct> {
    await this.assertProductIsBundle(refId);
    const dto = await this.productMultipartService.parseUpdateProduct(req);
    dto.productType = ProductType.BUNDLE;
    return this.update(refId, dto, updatedBy);
  }

  async updateBundleFromJsonBody(
    body: unknown,
    refId: string,
    updatedBy: string,
  ): Promise<IProduct> {
    await this.assertProductIsBundle(refId);
    const dto = {
      ...(body as object),
      productType: ProductType.BUNDLE,
    };
    return this.updateFromJsonBody(dto, refId, updatedBy);
  }

  async findBundleOne(refId: string): Promise<IProductDetail> {
    await this.assertProductIsBundle(refId);
    return this.findOne(refId);
  }

  private async assertProductIsBundle(refId: string): Promise<void> {
    const existing = await this.productsRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Product with refId ${refId} not found`);
    if (existing.productType !== ProductType.BUNDLE) {
      throw new NotFoundException(`Bundle product with refId ${refId} not found`);
    }
  }

  async createFromJsonBody(body: unknown, createdBy: string): Promise<IProduct> {
    try {
      const dto = await this.productMultipartService.validateJsonBody(body);
      return await this.createDraft(dto, createdBy);
    } catch (error) {
      this.logProductCreateFailure('json', error);
      throw error;
    }
  }

  async updateFromRequest(
    req: FastifyRequest,
    refId: string,
    updatedBy: string,
  ): Promise<IProduct> {
    const dto = await this.productMultipartService.parseUpdateProduct(req);
    return this.update(refId, dto, updatedBy);
  }

  async updateFromJsonBody(
    body: unknown,
    refId: string,
    updatedBy: string,
  ): Promise<IProduct> {
    const dto = await this.productMultipartService.validateUpdateJsonBody(body);
    return this.update(refId, dto, updatedBy);
  }

  async createDraft(
    dto: CreateProductDto,
    createdBy: string,
    options?: ProductMutationOptions,
  ): Promise<IProduct> {
    const normalizedDto =
      dto.productType === ProductType.BUNDLE ? normalizeBundleCreateDto(dto) : dto;

    const [masters, slugExists] = await Promise.all([
      this.masterResolver.resolve(normalizedDto),
      (async () => {
        const slug = normalizedDto.slug ?? generateProductSlug(normalizedDto.name);
        return { slug, exists: await this.productsRepository.existsBySlug(slug) };
      })(),
    ]);

    if (slugExists.exists) {
      throw new ConflictException(`Product slug "${slugExists.slug}" already exists`);
    }
    const slug = slugExists.slug;
    assertProductUrlSlugLength(slug, 'Product');

    if (normalizedDto.productType === ProductType.VARIABLE) {
      const allowed = new Set(normalizedDto.attributeRefIds ?? []);
      for (const variant of normalizedDto.variants ?? []) {
        validateVariantAttributeScope(variant.attributes ?? [], allowed);
      }
    }

    await this.assertTagUsageWithinCategoryLimit(masters.categoryId, normalizedDto.tagNames ?? [], null);

    const refId = await generateUniqueRefId(normalizedDto.name, (candidate) =>
      this.productsRepository.existsByRefId(candidate),
    );
    const attributeIdByRefId = masters.attributeIdByRefId;
    const labelSortOrders = await this.productInformationLabelsRepository.findActiveSortOrdersByName();

    const product = await this.dataSource.transaction(async (manager) => {
      const created = await this.productsRepository.create(
        {
          vendorId: normalizedDto.vendorId ?? null,
          name: normalizedDto.name,
          slug,
          productType: normalizedDto.productType,
          productNatureId: masters.productNatureId,
          categoryId: masters.categoryId,
          subCategoryId: masters.subCategoryId,
          subSubCategoryId: masters.subSubCategoryId,
          subSubSubCategoryId: masters.subSubSubCategoryId,
          brandId: masters.brandId,
          manufacturerId: masters.manufacturerId,
          packerId: masters.packerId,
          importerId: masters.importerId,
          countryOfOriginId: masters.countryOfOriginId,
          status: ProductStatus.DRAFT,
          rejectionReason: null,
          ...mapSpecificationFields(normalizedDto, { labelSortOrders }),
          description: normalizedDto.description ?? null,
          refId,
          createdBy,
        },
        manager,
      );

      const strategy = this.strategyFactory.resolve(normalizedDto.productType);
      await strategy.createVariants(manager, created, normalizedDto, masters, attributeIdByRefId);

      await Promise.all([
        this.relationsRepository.syncCategoryHierarchies(
          manager,
          created.id,
          masters.categoryHierarchies,
        ),
        this.relationsRepository.syncHealthConcerns(
          manager,
          created.id,
          masters.healthConcernIds,
        ),
        this.relationsRepository.syncWellnessGoals(manager, created.id, masters.wellnessGoalIds),
        this.relationsRepository.syncTags(manager, created.id, normalizedDto.tagNames ?? [], createdBy),
        this.relationsRepository.syncProductAttributes(manager, created.id, masters.attributeIds),
        this.relationsRepository.syncCategoryFilters(
          manager,
          created.id,
          masters.categoryFilterBindings,
        ),
      ]);

      const faqIds = [...masters.faqIds];
      if (normalizedDto.customFaqs?.length) {
        faqIds.push(
          ...(await this.relationsRepository.createCustomProductFaqs(
            manager,
            normalizedDto.customFaqs,
            createdBy,
          )),
        );
      }
      await this.relationsRepository.syncProductFaqs(manager, created.id, faqIds);

      const productMedia = collectProductMedia(normalizedDto);
      if (productMedia.length) {
        const variants = await manager.getRepository(ProductVariantEntity).find({
          where: { productId: created.id },
          select: ['id', 'sku'],
        });
        const skuToVariantId = new Map(variants.map((v) => [v.sku, v.id]));
        await this.relationsRepository.createMedia(manager, created.id, productMedia, skuToVariantId);
      }

      return created;
    });

    const loaded = await this.productsRepository.findByRefId(product.refId);
    if (!loaded) throw new NotFoundException('Product could not be loaded after creation');
    this.validateForSubmission(loaded);

    await this.productsRepository.updateFieldsByRefId(product.refId, {
      status: ProductStatus.PENDING_REVIEW,
      rejectionReason: null,
    });
    loaded.status = ProductStatus.PENDING_REVIEW;
    loaded.rejectionReason = null;

    await this.emitProductUpdated(product.refId, 'created');

    if (options?.skipDetailEnrichment) {
      return mapProductEntityToResponse(loaded);
    }

    return this.enrichProduct(mapProductEntityToResponse(loaded));
  }

  /**
   * Enforces that a category does not exceed {@link MAX_PRODUCTS_PER_CATEGORY_TAG}
   * products sharing the same tag. Runs before tags are persisted.
   */
  private async assertTagUsageWithinCategoryLimit(
    categoryId: string | null | undefined,
    tagNames: string[],
    excludeProductId: string | null,
  ): Promise<void> {
    if (!categoryId || !tagNames.length) return;

    const normalizedNames = [
      ...new Set(tagNames.map((name) => name.trim()).filter((name) => name.length > 0)),
    ];
    if (!normalizedNames.length) return;

    const slugByName = new Map(normalizedNames.map((name) => [name, generateTagSlug(name)]));
    const uniqueSlugs = [...new Set(slugByName.values())];

    const counts = await this.productsRepository.countProductsPerTagSlugInCategory(
      categoryId,
      uniqueSlugs,
      excludeProductId,
    );

    const exceeded = normalizedNames.filter((name) => {
      const existing = counts.get(slugByName.get(name)!) ?? 0;
      return existing + 1 > MAX_PRODUCTS_PER_CATEGORY_TAG;
    });

    if (exceeded.length) {
      throw new BadRequestException(
        `This category already has the maximum of ${MAX_PRODUCTS_PER_CATEGORY_TAG} products for tag(s): ${exceeded.join(', ')}`,
      );
    }
  }

  private logProductCreateFailure(source: 'json' | 'multipart', error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    this.logger.error(`Product create failed (${source}): ${message}`, stack);
  }

  async findAll(query: ProductQueryDto): Promise<PaginatedResult<IProduct>> {
    const paginationOptions = buildPaginationOptions(query);
    const filters = await this.resolveListFilters(query);
    const queryHash = buildQueryCacheHash({
      ...filters,
      productType: query.productType,
      status: query.status,
      variantSlug: query.variantSlug,
      categoryFilterCriteria: filters.categoryFilterCriteria,
      brandId: filters.brandId,
      brandIds: filters.brandIds,
      page: paginationOptions.page,
      limit: paginationOptions.limit,
      search: paginationOptions.search,
      sortBy: paginationOptions.sortBy,
      sortOrder: paginationOptions.sortOrder,
    });

    const tDb = Date.now();
    const raw = await this.cacheStrategy.cacheAside({
      key: CacheKeys.products.list(paginationOptions.page, paginationOptions.limit, queryHash),
      module: CacheModuleName.PRODUCT,
      loader: async () => {
        const { data, total } = await this.productsRepository.findAllVariantsPaginated({
          page: paginationOptions.page,
          limit: paginationOptions.limit,
          search: paginationOptions.search,
          sortBy: paginationOptions.sortBy,
          sortOrder: paginationOptions.sortOrder,
          productType: query.productType,
          status: query.status,
          categoryId: filters.categoryId,
          brandId: filters.brandId,
          brandIds: filters.brandIds,
          productNatureId: filters.productNatureId,
          variantSlug: query.variantSlug,
          categoryFilterCriteria: filters.categoryFilterCriteria,
        });
        this.logger.log(`[PERF] findAll | DB query: ${Date.now() - tDb}ms`);
        return buildPaginatedResult(
          data.map((variant) =>
            mapProductEntityToVariantListItem(variant.product, variant.id),
          ),
          total,
          paginationOptions,
        );
      },
    });
    const tEnrich = Date.now();
    const result = await this.enrichPaginatedProducts(raw);
    const imageCount = result.data.reduce(
      (sum, p) => sum + (p.media?.filter((m) => m.url).length ?? 0) + (p.wellnessGoals?.filter((g) => g.image).length ?? 0),
      0,
    );
    this.logger.log(
      `[PERF] findAll | Image URL signing (${imageCount} images): ${Date.now() - tEnrich}ms | TOTAL: ${Date.now() - tDb}ms`,
    );
    return result;
  }

  async findOne(refId: string): Promise<IProductDetail> {
    const tDb = Date.now();
    const raw = await this.cacheStrategy.cacheAside({
      key: CacheKeys.products.detail(refId),
      module: CacheModuleName.PRODUCT,
      loader: async () => {
        const entity = await this.productsRepository.findByRefId(refId);
        if (!entity) throw new NotFoundException(`Product with refId ${refId} not found`);
        this.logger.log(`[PERF] findOne refId="${refId}" | DB query: ${Date.now() - tDb}ms`);
        return mapProductEntityToDetailResponse(entity);
      },
    });
    const tEnrich = Date.now();
    const result = await this.enrichProductDetail(raw);
    this.logger.log(
      `[PERF] findOne refId="${refId}" | Image URL signing: ${Date.now() - tEnrich}ms | TOTAL: ${Date.now() - tDb}ms`,
    );
    return result;
  }

  async update(
    refId: string,
    dto: UpdateProductDto,
    updatedBy: string,
    options?: ProductMutationOptions,
  ): Promise<IProduct> {
    const existing = options?.lightweightLoad
      ? await this.productsRepository.findByRefIdForMutation(refId)
      : await this.productsRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Product with refId ${refId} not found`);
    this.assertEditable(existing);

    const labelSortOrders = await this.productInformationLabelsRepository.findActiveSortOrdersByName();
    const payload: Partial<ProductEntity> = {
      updatedBy,
      ...mapSpecificationFields(dto, { labelSortOrders }),
    };
    if (dto.name !== undefined) payload.name = dto.name;
    if (dto.description !== undefined) payload.description = dto.description ?? null;
    if (dto.vendorId !== undefined) payload.vendorId = dto.vendorId ?? null;

    if (dto.slug !== undefined || dto.name !== undefined) {
      const slug = dto.slug ?? generateProductSlug(dto.name ?? existing.name);
      assertProductUrlSlugLength(slug, 'Product');
      if (await this.productsRepository.existsBySlug(slug, refId)) {
        throw new ConflictException(`Product slug "${slug}" already exists`);
      }
      payload.slug = slug;
    }

    const isSimpleToVariable =
      existing.productType === ProductType.SIMPLE && dto.productType === ProductType.VARIABLE;
    const isVariableToSimple =
      existing.productType === ProductType.VARIABLE && dto.productType === ProductType.SIMPLE;
    const isProductTypeChanging = Boolean(dto.productType && dto.productType !== existing.productType);

    if (isProductTypeChanging && !isSimpleToVariable && !isVariableToSimple) {
      throw new BadRequestException(
        `Product type cannot be changed from "${existing.productType}" to "${dto.productType}"`,
      );
    }
    if (isProductTypeChanging) {
      payload.productType = dto.productType!;
    }

    if (isVariableToSimple) {
      if (dto.variants && dto.variants.length !== 1) {
        throw new BadRequestException(
          'When converting to a single product, provide exactly one variant to keep',
        );
      }
      if (dto.variants?.[0]?.attributes?.length) {
        throw new BadRequestException('Single products cannot have variant attributes');
      }
      if (!dto.variants && (existing.variants?.length ?? 0) > 1) {
        throw new BadRequestException(
          'When converting a variant product to a single product, include exactly one variant in the payload to keep',
        );
      }
    }

    const effectiveProductType = dto.productType ?? existing.productType;

    const masters =
      dto.productNatureRefId ||
        dtoHasCategoryHierarchyChanges(dto) ||
        dto.brandRefId ||
        dto.countryOfOriginRefId ||
        dto.attributeRefIds
        ? await this.masterResolver.resolve({
          ...dto,
          productType: effectiveProductType,
          productNatureRefId: dto.productNatureRefId ?? existing.productNature?.refId,
          categoryRefId: dto.categoryRefId ?? existing.category?.refId ?? '',
          subCategoryRefId:
            dto.subCategoryRefId !== undefined
              ? dto.subCategoryRefId
              : (existing.subCategory?.refId ?? undefined),
          subSubCategoryRefId:
            dto.subSubCategoryRefId !== undefined
              ? dto.subSubCategoryRefId
              : (existing.subSubCategory?.refId ?? undefined),
          subSubSubCategoryRefId:
            dto.subSubSubCategoryRefId !== undefined
              ? dto.subSubSubCategoryRefId
              : (existing.subSubSubCategory?.refId ?? undefined),
          // Prefer explicit `categories[]`. When only flat fields change, omit
          // `categories` so normalizeCategoryHierarchyInputs uses the flat refs.
          categories:
            dto.categories !== undefined
              ? dto.categories
              : dtoHasCategoryHierarchyChanges(dto)
                ? undefined
                : existing.categoryHierarchies?.length
                  ? existing.categoryHierarchies
                      .slice()
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((item) => ({
                        categoryRefId: item.category?.refId ?? '',
                        subCategoryRefId: item.subCategory?.refId ?? undefined,
                        subSubCategoryRefId: item.subSubCategory?.refId ?? undefined,
                        subSubSubCategoryRefId: item.subSubSubCategory?.refId ?? undefined,
                      }))
                  : undefined,
          brandRefId: dto.brandRefId ?? existing.brand?.refId ?? '',
          name: dto.name ?? existing.name,
        } as CreateProductDto)
        : null;

    if (masters) {
      payload.productNatureId = masters.productNatureId;
      payload.categoryId = masters.categoryId;
      payload.subCategoryId = masters.subCategoryId;
      payload.subSubCategoryId = masters.subSubCategoryId;
      payload.subSubSubCategoryId = masters.subSubSubCategoryId;
      payload.brandId = masters.brandId;
      // Only overwrite optional masters when the DTO explicitly sends them.
      // Bulk re-upload often omits manufacturerRefId; clearing would wipe existing links.
      if (dto.manufacturerRefId !== undefined) {
        payload.manufacturerId = masters.manufacturerId;
      }
      if (dto.packerRefId !== undefined) {
        payload.packerId = masters.packerId;
      }
      if (dto.importerRefId !== undefined) {
        payload.importerId = masters.importerId;
      }
      if (dto.countryOfOriginRefId !== undefined) {
        payload.countryOfOriginId = masters.countryOfOriginId;
      }
    }

    const productSlug = payload.slug ?? existing.slug;
    const needsRelationSync = Boolean(
      dto.healthConcernRefIds ||
      dto.wellnessGoalRefIds ||
      dto.tagNames ||
      dto.faqRefIds ||
      dto.customFaqs ||
      dto.attributeRefIds ||
      dto.categoryFilters !== undefined ||
      dtoHasCategoryHierarchyChanges(dto) ||
      masters?.attributeIds,
    );
    const needsVariantSync = dto.variants !== undefined || (
      effectiveProductType === ProductType.BUNDLE &&
      (dto.mrp !== undefined || dto.sellingPrice !== undefined || dto.stock !== undefined || dto.sku !== undefined)
    );
    const needsBundleItemsSync =
      effectiveProductType === ProductType.BUNDLE && dto.bundleItems !== undefined;
    const needsMediaSync =
      dto.media !== undefined || hasVariantMediaInPayload(dto.variants);

    if (needsVariantSync && effectiveProductType === ProductType.VARIABLE) {
      const allowed = new Set(
        dto.attributeRefIds ??
        existing.attributeMappings?.map((mapping) => mapping.attribute?.refId ?? '') ??
        [],
      );
      for (const variant of dto.variants ?? []) {
        validateVariantAttributeScope(variant.attributes ?? [], allowed);
      }
    }

    const resolved =
      needsRelationSync || needsVariantSync
        ? masters ??
        (await this.masterResolver.resolve({
          productType: effectiveProductType,
          productNatureRefId: existing.productNature?.refId,
          categoryRefId: existing.category?.refId ?? '',
          brandRefId: existing.brand?.refId ?? '',
          name: existing.name,
          healthConcernRefIds: dto.healthConcernRefIds,
          wellnessGoalRefIds: dto.wellnessGoalRefIds,
          faqRefIds: dto.faqRefIds,
          attributeRefIds: dto.attributeRefIds,
        } as CreateProductDto))
        : null;

    const attributeRefIdsForVariants = [
      ...new Set([
        ...(dto.attributeRefIds ?? []),
        ...(dto.variants?.flatMap(
          (variant) => variant.attributes?.map((item) => item.attributeRefId) ?? [],
        ) ?? []),
      ]),
    ];
    const attributeIdByRefId = needsVariantSync
      ? await this.masterResolver.resolveAttributeIds(attributeRefIdsForVariants)
      : new Map<string, string>();

    const categoryFilterBindings =
      dto.categoryFilters !== undefined
        ? await this.masterResolver.resolveCategoryFilterBindings(dto.categoryFilters)
        : null;

    if (dto.tagNames) {
      await this.assertTagUsageWithinCategoryLimit(
        masters?.categoryId ?? existing.categoryId,
        dto.tagNames,
        existing.id,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await this.productsRepository.updateByRefId(refId, payload, manager);
      await this.relationsRepository.cleanupLegacyManualMediaKeys(manager, existing.id);

      if (resolved) {
        if (dtoHasCategoryHierarchyChanges(dto) && masters?.categoryHierarchies) {
          await this.relationsRepository.syncCategoryHierarchies(
            manager,
            existing.id,
            masters.categoryHierarchies,
          );
        }
        if (dto.healthConcernRefIds) {
          await this.relationsRepository.syncHealthConcerns(
            manager,
            existing.id,
            resolved.healthConcernIds,
          );
        }
        if (dto.wellnessGoalRefIds) {
          await this.relationsRepository.syncWellnessGoals(
            manager,
            existing.id,
            resolved.wellnessGoalIds,
          );
        }
        if (dto.tagNames) {
          await this.relationsRepository.syncTags(manager, existing.id, dto.tagNames, updatedBy);
        }
        if (dto.faqRefIds) {
          await this.relationsRepository.syncProductFaqs(manager, existing.id, resolved.faqIds);
        }
        if (dto.customFaqs) {
          const faqIds = await this.relationsRepository.createCustomProductFaqs(
            manager,
            dto.customFaqs,
            updatedBy,
          );
          await this.relationsRepository.syncProductFaqs(manager, existing.id, faqIds);
        }
        if (dto.attributeRefIds && !isVariableToSimple) {
          await this.relationsRepository.syncProductAttributes(
            manager,
            existing.id,
            resolved.attributeIds,
          );
        }
      }

      if (categoryFilterBindings !== null) {
        await this.relationsRepository.syncCategoryFilters(
          manager,
          existing.id,
          categoryFilterBindings,
        );
      }

      if (needsBundleItemsSync && dto.bundleItems) {
        const resolvedItems = await resolveBundleChildItems(
          dto.bundleItems,
          existing.id,
          (refIds) => this.productsRepository.findIdsByRefIds(refIds, manager),
        );
        await this.relationsRepository.syncBundles(manager, existing.id, resolvedItems);
      }

      if (needsVariantSync && dto.variants) {
        const variantsForSync =
          effectiveProductType === ProductType.SIMPLE && dto.expiryDate
            ? dto.variants.map((variant, index) =>
              index === 0
                ? { ...variant, expiryDate: variant.expiryDate ?? dto.expiryDate }
                : variant,
            )
            : effectiveProductType === ProductType.BUNDLE
              ? ensureBundlePricingVariants({
                  name: dto.name ?? existing.name,
                  variants: dto.variants,
                  mrp: dto.mrp,
                  sellingPrice: dto.sellingPrice,
                  stock: dto.stock,
                  sku: dto.sku,
                  discountPercentage: dto.discountPercentage,
                })
              : dto.variants;

        await this.variantsRepository.syncVariants(
          manager,
          existing.id,
          productSlug,
          effectiveProductType,  // use the new type, not the old one
          variantsForSync,
          attributeIdByRefId,
        );
      } else if (
        needsVariantSync &&
        effectiveProductType === ProductType.BUNDLE &&
        !dto.variants
      ) {
        const pricingVariants = ensureBundlePricingVariants({
          name: dto.name ?? existing.name,
          variants: undefined,
          mrp: dto.mrp ?? Number(existing.variants?.[0]?.mrp ?? 0),
          sellingPrice: dto.sellingPrice ?? Number(existing.variants?.[0]?.sellingPrice ?? 0),
          stock: dto.stock ?? existing.variants?.[0]?.stock ?? 0,
          sku: dto.sku ?? existing.variants?.[0]?.sku,
          discountPercentage:
            dto.discountPercentage ??
            (existing.variants?.[0]?.discountPercentage != null
              ? Number(existing.variants[0].discountPercentage)
              : undefined),
        });
        await this.variantsRepository.syncVariants(
          manager,
          existing.id,
          productSlug,
          ProductType.BUNDLE,
          pricingVariants,
          attributeIdByRefId,
        );
      }

      if (isVariableToSimple) {
        await this.relationsRepository.syncProductAttributes(manager, existing.id, []);

        if (!needsVariantSync && existing.variants?.length === 1) {
          const variantId = existing.variants[0].id;
          await manager.getRepository(VariantAttributeValueEntity).delete({ variantId });
          await manager.getRepository(ProductVariantEntity).update(
            { id: variantId },
            { combinationKey: null },
          );
        }
      }

      if (needsMediaSync) {
        const media = collectProductMedia({
          ...dto,
          productType: effectiveProductType,
          name: dto.name ?? existing.name,
          categoryRefId: existing.category?.refId ?? '',
          brandRefId: existing.brand?.refId ?? '',
        } as CreateProductDto);
        const variants = await manager.getRepository(ProductVariantEntity).find({
          where: { productId: existing.id },
          select: ['id', 'sku'],
        });
        const skuToVariantId = new Map(variants.map((variant) => [variant.sku, variant.id]));
        await this.relationsRepository.syncMedia(manager, existing.id, media, skuToVariantId);
      }
    });

    const updated = await this.productsRepository.findByRefIdForMutation(refId);
    if (!updated) {
      throw new NotFoundException(`Product with refId ${refId} not found after update`);
    }
    await this.emitProductUpdated(refId, 'updated');
    if (options?.skipDetailEnrichment) {
      return mapProductEntityToResponse(updated);
    }
    return this.findOne(refId);
  }

  async submitForReview(refId: string, updatedBy: string): Promise<IProduct> {
    const existing = await this.productsRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Product with refId ${refId} not found`);
    this.assertEditable(existing);
    this.validateForSubmission(existing);

    await this.productsRepository.updateByRefId(refId, {
      status: ProductStatus.PENDING_REVIEW,
      rejectionReason: null,
      updatedBy,
    });
    await this.emitProductUpdated(refId, 'status_updated');
    return this.findOne(refId);
  }

  async approve(refId: string, updatedBy: string): Promise<IProduct> {
    const existing = await this.productsRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Product with refId ${refId} not found`);
    // if (existing.status !== ProductStatus.PENDING_REVIEW) {
    //   throw new BadRequestException('Only products pending review can be approved');
    // }

    await this.productsRepository.updateByRefId(refId, {
      status: ProductStatus.PUBLISHED,
      publishedAt: new Date(),
      rejectionReason: null,
      updatedBy,
    });
    await this.emitProductUpdated(refId, 'status_updated');
    return this.findOne(refId);
  }

  async reject(refId: string, dto: RejectProductDto, updatedBy: string): Promise<IProduct> {
    const existing = await this.productsRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Product with refId ${refId} not found`);
    // if (existing.status !== ProductStatus.PENDING_REVIEW) {
    //   throw new BadRequestException('Only products pending review can be rejected');
    // }

    await this.productsRepository.updateByRefId(refId, {
      status: ProductStatus.REJECTED,
      rejectionReason: dto.reason,
      updatedBy,
    });
    await this.emitProductUpdated(refId, 'status_updated');
    return this.findOne(refId);
  }

  async publish(
    refId: string,
    updatedBy: string,
    options?: ProductMutationOptions,
  ): Promise<IProduct> {
    const existing = options?.lightweightLoad
      ? await this.productsRepository.findByRefIdForMutation(refId)
      : await this.productsRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Product with refId ${refId} not found`);
    if (!existing.variants?.length && existing.productType !== ProductType.BUNDLE) {
      throw new BadRequestException('Product must have at least one variant before publishing');
    }

    if (existing.status === ProductStatus.PUBLISHED) {
      if (options?.skipDetailEnrichment) {
        return mapProductEntityToResponse(existing);
      }
      return this.findOne(refId);
    }

    await this.productsRepository.updateByRefId(refId, {
      status: ProductStatus.PUBLISHED,
      publishedAt: new Date(),
      updatedBy,
    });
    await this.emitProductUpdated(refId, 'updated');
    if (options?.skipDetailEnrichment) {
      existing.status = ProductStatus.PUBLISHED;
      return mapProductEntityToResponse(existing);
    }
    return this.findOne(refId);
  }

  async updateStatus(refId: string, dto: UpdateProductStatusDto, updatedBy: string): Promise<IProduct> {
    await this.productsRepository.updateByRefId(refId, { status: dto.status, updatedBy });
    await this.emitProductUpdated(refId, 'status_updated');
    return this.findOne(refId);
  }

  /**
   * Sets stock = 0 on every non-deleted variant for the selected products.
   * Used by admin product list multi-select "Mark out of stock".
   */
  async bulkMarkOutOfStock(dto: BulkMarkOutOfStockDto): Promise<IBulkMarkOutOfStockResult> {
    const uniqueRefIds = [...new Set(dto.productRefIds.map((refId) => refId.trim()).filter(Boolean))];
    if (!uniqueRefIds.length) {
      throw new BadRequestException('productRefIds must contain at least one product refId');
    }

    const idByRefId = await this.productsRepository.findIdsByRefIds(uniqueRefIds);
    const notFound = uniqueRefIds.filter((refId) => !idByRefId.has(refId));
    const foundEntries = [...idByRefId.entries()];

    if (!foundEntries.length) {
      return {
        requested: uniqueRefIds.length,
        updated: [],
        alreadyOutOfStock: [],
        notFound,
        variantsUpdated: 0,
      };
    }

    const productIds = foundEntries.map(([, productId]) => productId);
    const statsByProductId = await this.variantsRepository.markOutOfStockByProductIds(productIds);

    const updated: string[] = [];
    const alreadyOutOfStock: string[] = [];
    let variantsUpdated = 0;

    for (const [refId, productId] of foundEntries) {
      const stats = statsByProductId.get(productId) ?? { updated: 0, alreadyZero: 0 };
      variantsUpdated += stats.updated;
      if (stats.updated > 0) {
        updated.push(refId);
      } else {
        alreadyOutOfStock.push(refId);
      }
    }

    await Promise.all(updated.map((refId) => this.emitProductUpdated(refId, 'updated')));

    return {
      requested: uniqueRefIds.length,
      updated,
      alreadyOutOfStock,
      notFound,
      variantsUpdated,
    };
  }

  async bulkRestoreStock(dto: BulkRestoreStockDto): Promise<{
    requested: number;
    updated: string[];
    notFound: string[];
    variantsUpdated: number;
  }> {
    const uniqueItems = new Map<string, number>();
    for (const item of dto.items) {
      uniqueItems.set(item.productRefId.trim(), item.stock);
    }
    const uniqueRefIds = [...uniqueItems.keys()].filter(Boolean);
    if (!uniqueRefIds.length) {
      throw new BadRequestException('items must contain at least one product refId');
    }

    const idByRefId = await this.productsRepository.findIdsByRefIds(uniqueRefIds);
    const notFound = uniqueRefIds.filter((refId) => !idByRefId.has(refId));
    const updates = [...idByRefId.entries()].map(([refId, productId]) => ({
      productId,
      stock: uniqueItems.get(refId) ?? 0,
      refId,
    }));

    if (!updates.length) {
      return { requested: uniqueRefIds.length, updated: [], notFound, variantsUpdated: 0 };
    }

    const counts = await this.variantsRepository.setStockByProductIds(
      updates.map(({ productId, stock }) => ({ productId, stock })),
    );

    const updated = updates
      .filter((item) => (counts.get(item.productId) ?? 0) > 0)
      .map((item) => item.refId);
    const variantsUpdated = [...counts.values()].reduce((sum, n) => sum + n, 0);

    await Promise.all(updated.map((refId) => this.emitProductUpdated(refId, 'updated')));

    return {
      requested: uniqueRefIds.length,
      updated,
      notFound,
      variantsUpdated,
    };
  }

  async unpublish(refId: string, updatedBy: string): Promise<IProduct> {
    const existing = await this.productsRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Product with refId ${refId} not found`);

    await this.productsRepository.updateByRefId(refId, {
      status: ProductStatus.INACTIVE,
      updatedBy,
    });
    await this.emitProductUpdated(refId, 'status_updated');
    return this.findOne(refId);
  }

  async restore(refId: string): Promise<IProduct> {
    const restored = await this.productsRepository.restoreByRefId(refId);
    if (!restored) {
      throw new NotFoundException(`Deleted product with refId ${refId} not found`);
    }
    await this.emitProductUpdated(refId, 'updated');
    return this.findOne(refId);
  }

  /** List helpers for dedicated bundle endpoints. */
  async findBundles(query: ProductQueryDto, status?: ProductStatus): Promise<PaginatedResult<IProduct>> {
    return this.findAll({
      ...query,
      productType: ProductType.BUNDLE,
      ...(status ? { status } : { status: query.status ?? ProductStatus.PUBLISHED }),
    });
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.productsRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Product with refId ${refId} not found`);
    await this.productsRepository.softDeleteByRefId(refId);
    await this.emitProductUpdated(refId, 'deleted');
  }

  /**
   * Move all variants from peer products onto the canonical product, then soft-delete
   * emptied peers. Used by bulk upload style_group consolidation (SKU and/or Product ID matches).
   */
  async consolidateVariantsOntoProduct(
    targetRefId: string,
    sourceRefIds: string[],
    _skus: string[],
  ): Promise<void> {
    const target = await this.productsRepository.findByRefId(targetRefId);
    if (!target) {
      throw new NotFoundException(`Product with refId ${targetRefId} not found`);
    }

    const peers = [...new Set(sourceRefIds)].filter((refId) => refId && refId !== targetRefId);
    if (!peers.length) return;

    await this.dataSource.transaction(async (manager) => {
      const variantRepo = manager.getRepository(ProductVariantEntity);
      const productRepo = manager.getRepository(ProductEntity);

      for (const sourceRefId of peers) {
        const source = await this.productsRepository.findByRefId(sourceRefId, manager);
        if (!source) continue;

        const variants = await variantRepo.find({ where: { productId: source.id } });
        for (const variant of variants) {
          await variantRepo.update(
            { id: variant.id },
            { productId: target.id, combinationKey: null },
          );
        }

        await productRepo.softDelete({ id: source.id });
        this.logger.log(
          `Soft-deleted consolidated peer product ${sourceRefId} after moving ${variants.length} variant(s) onto ${targetRefId}`,
        );
      }
    });

    for (const sourceRefId of peers) {
      await this.emitProductUpdated(sourceRefId, 'updated');
    }
    await this.emitProductUpdated(targetRefId, 'updated');
  }

  private assertEditable(entity: ProductEntity): void {
    // if (entity.status === ProductStatus.PUBLISHED) {
    //   throw new BadRequestException('Published products cannot be edited via create/update flow');
    // }
  }

  private validateForSubmission(entity: ProductEntity): void {
    if (!entity.brandId) throw new BadRequestException('Brand is required before submission');
    if (!entity.categoryId) throw new BadRequestException('Category is required before submission');

    if (entity.productType === ProductType.BUNDLE) {
      if (!entity.bundleItems?.length) {
        throw new BadRequestException('Bundle must contain at least one product');
      }
      if (!entity.variants?.length) {
        throw new BadRequestException('Bundle products require pricing (mrp, sellingPrice, stock)');
      }
      return;
    }

    if (!entity.variants?.length) {
      throw new BadRequestException('Product must have at least one variant before submission');
    }

    if (entity.productType === ProductType.SIMPLE && entity.variants.length !== 1) {
      throw new BadRequestException('Single products must have exactly one variant');
    }

    if (entity.productType === ProductType.VARIABLE) {
      if (!entity.attributeMappings?.length) {
        throw new BadRequestException('Variant products require configured attributes');
      }
      for (const variant of entity.variants) {
        if (!variant.attributeValues?.length) {
          throw new BadRequestException('Each variant must include attribute values');
        }
      }
    }
  }

  private async enrichProductDetail(product: IProductDetail): Promise<IProductDetail> {
    const enrichedBase = await this.enrichProduct(product);
    const brandFields = ['logo', 'banner'] as const;
    const logoFields = ['logo'] as const;
    const healthConcernFields = ['icon', 'banner'] as const;

    const tBrand = Date.now();
    const [brand, manufacturer, packer, importer, healthConcerns] = await Promise.all([
      product.brand
        ? this.storageUrlEnricher.enrichFields(product.brand, [...brandFields])
        : Promise.resolve(null),
      product.manufacturer
        ? this.storageUrlEnricher.enrichFields(product.manufacturer, [...logoFields])
        : Promise.resolve(null),
      product.packer
        ? this.storageUrlEnricher.enrichFields(product.packer, [...logoFields])
        : Promise.resolve(null),
      product.importer
        ? this.storageUrlEnricher.enrichFields(product.importer, [...logoFields])
        : Promise.resolve(null),
      this.storageUrlEnricher.enrichManyFields(product.healthConcerns, [...healthConcernFields]),
    ]);
    this.logger.log(
      `  [IMG] brand/manufacturer/packer/importer/healthConcerns signing: ${Date.now() - tBrand}ms`,
    );

    return {
      ...enrichedBase,
      category: product.category,
      subCategory: product.subCategory,
      subSubCategory: product.subSubCategory,
      subSubSubCategory: product.subSubSubCategory,
      categoryHierarchies: product.categoryHierarchies,
      brand,
      productNature: product.productNature,
      manufacturer,
      packer,
      importer,
      countryOfOrigin: product.countryOfOrigin,
      healthConcerns,
    };
  }

  private async enrichProduct(
    product: IProduct,
    labelSortOrders?: Map<string, number>,
  ): Promise<IProduct> {
    const media = await Promise.all(
      (product.media ?? []).map(async (item) => {
        if (!item.url) return item;
        const key = typeof item.url === 'string'
          ? item.url
          : (item.url as { key?: string }).key ?? '(unknown)';
        const t = Date.now();
        const [enriched] = await this.storageUrlEnricher.enrichReferences(
          [item],
          (i) => i.url,
          (i, url) => ({ ...i, url }),
        );
        this.logger.log(`  [IMG] media key="${key}" signing=${Date.now() - t}ms`);
        return enriched;
      }),
    );

    const wellnessGoals = await Promise.all(
      (product.wellnessGoals ?? []).map(async (item) => {
        if (!item.image) return item;
        const key = typeof item.image === 'string'
          ? item.image
          : (item.image as { key?: string }).key ?? '(unknown)';
        const t = Date.now();
        const [enriched] = await this.storageUrlEnricher.enrichReferences(
          [item],
          (i) => i.image,
          (i, image) => ({ ...i, image }),
        );
        this.logger.log(`  [IMG] wellness key="${key}" signing=${Date.now() - t}ms`);
        return enriched;
      }),
    );

    const sizeChart = product.sizeChart
      ? await this.storageUrlEnricher.toReference(product.sizeChart)
      : null;

    const variantImagesById = new Map<
      string,
      Array<{
        id: string;
        type: IProduct['media'][number]['type'];
        url: IProduct['media'][number]['url'];
        sortOrder: number;
        isPrimary: boolean;
      }>
    >();
    for (const item of media) {
      if (!item.variantId) continue;
      const list = variantImagesById.get(item.variantId) ?? [];
      list.push({
        id: item.id,
        type: item.type,
        url: item.url,
        sortOrder: item.sortOrder,
        isPrimary: item.isPrimary,
      });
      variantImagesById.set(item.variantId, list);
    }

    const variants = (product.variants ?? []).map((variant) => ({
      ...variant,
      images: (variantImagesById.get(variant.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
    }));

    const resolvedLabelSortOrders =
      labelSortOrders ?? (await this.productInformationLabelsRepository.findActiveSortOrdersByName());
    const productInformation = enrichProductInformation(
      product.productInformation,
      resolvedLabelSortOrders,
    );

    return { ...product, productInformation, media, wellnessGoals, sizeChart, variants };
  }

  private async enrichPaginatedProducts(
    result: PaginatedResult<IProduct>,
  ): Promise<PaginatedResult<IProduct>> {
    const labelSortOrders = await this.productInformationLabelsRepository.findActiveSortOrdersByName();
    return {
      ...result,
      data: await Promise.all(
        result.data.map((product) => this.enrichProduct(product, labelSortOrders)),
      ),
    };
  }

  private async resolveListFilters(query: ProductQueryDto) {
    const queryBindings = parseCategoryFilterQueryBindings(query);
    const [category, brandFilters, nature, categoryFilterCriteria] = await Promise.all([
      query.categoryRefId
        ? this.categoriesRepository.findByRefId(query.categoryRefId)
        : Promise.resolve(null),
      this.resolveBrandFilters(query),
      query.productNatureRefId
        ? this.productNaturesRepository.findByRefId(query.productNatureRefId)
        : Promise.resolve(null),
      queryBindings
        ? this.masterResolver.resolveCategoryFilterBindings(queryBindings)
        : Promise.resolve(undefined),
    ]);

    return {
      categoryId: category?.id,
      brandId: brandFilters.brandId,
      brandIds: brandFilters.brandIds,
      productNatureId: nature?.id,
      categoryFilterCriteria,
    };
  }

  private async resolveBrandFilters(
    query: ProductQueryDto,
  ): Promise<{ brandId?: string; brandIds?: string[] }> {
    const refIds = [
      ...new Set([
        ...(query.brandRefIds ?? []),
        ...(query.brandRefId ? [query.brandRefId] : []),
      ]),
    ];

    if (refIds.length === 0) {
      return {};
    }

    if (refIds.length === 1) {
      const brand = await this.brandsRepository.findByRefId(refIds[0]);
      if (!brand) {
        throw new NotFoundException(`Brand with refId "${refIds[0]}" not found`);
      }
      return { brandId: brand.id };
    }

    const brands = await this.brandsRepository.findByRefIds(refIds);
    const foundRefIds = new Set(brands.map((brand) => brand.refId));
    const missingRefIds = refIds.filter((refId) => !foundRefIds.has(refId));
    if (missingRefIds.length > 0) {
      throw new NotFoundException(
        `Brand with refId "${missingRefIds.join('", "')}" not found`,
      );
    }

    return { brandIds: brands.map((brand) => brand.id) };
  }

  private async emitProductUpdated(
    refId: string,
    action: 'created' | 'updated' | 'deleted' | 'status_updated',
  ): Promise<void> {
    await this.eventEmitter.emitAsync(EVENTS.PRODUCT_UPDATED, new ProductUpdatedEvent(refId, action));
  }

  /** Published storefront products for cross-module consumers (wishlist, etc.). */
  findPublishedById(id: string): Promise<ProductEntity | null> {
    return this.productsRepository.findPublishedById(id);
  }

  findPublishedByIds(ids: string[]): Promise<ProductEntity[]> {
    return this.productsRepository.findPublishedByIds(ids);
  }

  findPublishedListByIds(ids: string[]): Promise<ProductEntity[]> {
    return this.productsRepository.findPublishedListByIds(ids);
  }

  existsPublishedById(id: string): Promise<boolean> {
    return this.productsRepository.existsPublishedById(id);
  }
}
