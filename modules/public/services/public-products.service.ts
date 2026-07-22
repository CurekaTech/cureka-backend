import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  getSalableStockQuantity,
  isVariantInStock,
  PaginatedResult,
} from '@packages/common';
import {
  buildQueryCacheHash,
  CacheKeys,
  CacheModuleName,
  CacheStrategyService,
} from '@packages/cache';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { CategoryHierarchyLevel } from '@modules/master/enums/category-hierarchy-level.enum';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { BrandsRepository } from '@modules/master/repositories/brands.repository';
import { ProductNaturesRepository } from '@modules/master/repositories/product-natures.repository';
import { HealthConcernsRepository } from '@modules/master/repositories/health-concerns.repository';
import { WellnessGoalsRepository } from '@modules/master/repositories/wellness-goals.repository';
import { ProductMasterResolverService } from '@modules/product/services/product-master-resolver.service';
import { parseCategoryFilterQueryBindings } from '@modules/product/utils/category-filter-query.util';
import { enrichProductInformation } from '@modules/product/utils/product-information.util';
import { ProductInformationLabelsRepository } from '@modules/product/repositories/product-information-labels.repository';
import { ProductMediaType } from '@modules/product/enums/product-media-type.enum';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { resolvePublicExpiryDate } from '@modules/product/utils/expiry-date.util';
import { PublicProductQueryDto } from '../dto/public-product-query.dto';
import { resolvePublicPriceRange } from '../utils/price-range-query.util';
import {
  IPublicImporterSummary,
  IPublicManufacturerSummary,
  IPublicPackerSummary,
  IPublicProductCard,
  IPublicProductDetail,
  IPublicProductListResponse,
  IPublicProductVariantSearchItem,
} from '../interfaces/public-product.interface';
import { IPublicCategoryProductListingContext } from '../interfaces/public-category.interface';
import {
  mapProductEntitiesToPublicCards,
  mapProductEntityToPublicDetail,
  mapVariantEntitiesToPublicSearchItems,
  pickPreferredPublicVariant,
  applySelectedVariantDetailToPublicProduct,
} from '../mappers/public-product.mapper';

/** Tag slug that marks a product as a best seller (see homepage Best Sellers section). */
const BEST_SELLERS_TAG_SLUG = 'bestsellers';

@Injectable()
export class PublicProductsService {
  private readonly logger = new Logger(PublicProductsService.name);

  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly brandsRepository: BrandsRepository,
    private readonly productNaturesRepository: ProductNaturesRepository,
    private readonly healthConcernsRepository: HealthConcernsRepository,
    private readonly wellnessGoalsRepository: WellnessGoalsRepository,
    private readonly masterResolver: ProductMasterResolverService,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly productInformationLabelsRepository: ProductInformationLabelsRepository,
  ) {}

  async findAll(query: PublicProductQueryDto): Promise<IPublicProductListResponse> {
    const paginationOptions = buildPaginationOptions(query);
    const filters = await this.resolveListFilters(query);
    const priceRange = resolvePublicPriceRange(query);
    const queryHash = buildQueryCacheHash({
      categoryId: filters.categoryId,
      brandId: filters.brandId,
      brandIds: filters.brandIds,
      productNatureId: filters.productNatureId,
      healthConcernId: filters.healthConcernId,
      wellnessGoalId: filters.wellnessGoalId,
      categoryFilterCriteria: filters.categoryFilterCriteria,
      categoryRefId: query.categoryRefId,
      categorySlug: query.categorySlug,
      brandRefId: query.brandRefId,
      brandSlug: query.brandSlug,
      healthConcernRefId: query.healthConcernRefId,
      healthConcernSlug: query.healthConcernSlug,
      productNatureRefId: query.productNatureRefId,
      wellnessGoalRefId: query.wellnessGoalRefId,
      variantSlug: query.variantSlug,
      tagSlug: query.tagSlug,
      minPrice: priceRange?.minPrice,
      maxPrice: priceRange?.maxPrice,
      priceRange: query.priceRange,
      page: paginationOptions.page,
      limit: paginationOptions.limit,
      search: paginationOptions.search,
      sortBy: paginationOptions.sortBy,
      sortOrder: paginationOptions.sortOrder,
      productType: query.productType,
    });

    const tDb = Date.now();
    const raw = await this.cacheStrategy.cacheAside({
      key: CacheKeys.publicProducts.list(queryHash),
      module: CacheModuleName.HOMEPAGE,
      loader: async () => {
        const { data, total } = await this.productsRepository.findPublishedPaginated({
          page: paginationOptions.page,
          limit: paginationOptions.limit,
          search: paginationOptions.search,
          sortBy: paginationOptions.sortBy,
          sortOrder: paginationOptions.sortOrder,
          productType: query.productType,
          categoryId: filters.categoryId,
          brandId: filters.brandId,
          brandIds: filters.brandIds,
          productNatureId: filters.productNatureId,
          healthConcernId: filters.healthConcernId,
          wellnessGoalId: filters.wellnessGoalId,
          variantSlug: query.variantSlug,
          tagSlug: query.tagSlug,
          categoryFilterCriteria: filters.categoryFilterCriteria,
          minPrice: priceRange?.minPrice,
          maxPrice: priceRange?.maxPrice,
        });
        this.logger.log(`[PERF] findAll | DB query: ${Date.now() - tDb}ms`);
        return buildPaginatedResult(
          mapProductEntitiesToPublicCards(data),
          total,
          paginationOptions,
        );
      },
    });
    const tEnrich = Date.now();
    const result = await this.enrichPaginatedCards(raw);
    const category = filters.category
      ? await this.buildCategoryListingContext(filters.category)
      : null;
    const imageCount = result.data.filter((c) => c.primaryImageUrl).length;
    this.logger.log(
      `[PERF] findAll | Image URL signing (${imageCount} images): ${Date.now() - tEnrich}ms | TOTAL: ${Date.now() - tDb}ms`,
    );
    return { ...result, category };
  }

  /**
   * "View all" best sellers listing (paginated) — every published product carrying the
   * "bestsellers" tag, newest-first by default. Supports the same filters as the product
   * listing (e.g. categoryRefId/slug). The tag filter is forced and cannot be overridden.
   */
  async findBestSellers(
    query: PublicProductQueryDto,
  ): Promise<IPublicProductListResponse> {
    return this.findAll({
      ...query,
      sortBy: query.sortBy ?? 'publishedAt',
      sortOrder: query.sortOrder ?? 'DESC',
      tagSlug: BEST_SELLERS_TAG_SLUG,
    });
  }

  async searchVariants(
    query: PublicProductQueryDto,
  ): Promise<PaginatedResult<IPublicProductVariantSearchItem>> {
    const paginationOptions = buildPaginationOptions(query);
    const filters = await this.resolveListFilters(query);
    const priceRange = resolvePublicPriceRange(query);
    const queryHash = buildQueryCacheHash({
      categoryId: filters.categoryId,
      brandId: filters.brandId,
      brandIds: filters.brandIds,
      productNatureId: filters.productNatureId,
      healthConcernId: filters.healthConcernId,
      wellnessGoalId: filters.wellnessGoalId,
      categoryFilterCriteria: filters.categoryFilterCriteria,
      categoryRefId: query.categoryRefId,
      categorySlug: query.categorySlug,
      brandRefId: query.brandRefId,
      brandSlug: query.brandSlug,
      healthConcernRefId: query.healthConcernRefId,
      healthConcernSlug: query.healthConcernSlug,
      productNatureRefId: query.productNatureRefId,
      wellnessGoalRefId: query.wellnessGoalRefId,
      variantSlug: query.variantSlug,
      minPrice: priceRange?.minPrice,
      maxPrice: priceRange?.maxPrice,
      priceRange: query.priceRange,
      page: paginationOptions.page,
      limit: paginationOptions.limit,
      search: paginationOptions.search,
      sortBy: paginationOptions.sortBy,
      sortOrder: paginationOptions.sortOrder,
      productType: query.productType,
    });

    const tDb = Date.now();
    const raw = await this.cacheStrategy.cacheAside({
      key: CacheKeys.publicProducts.variantSearch(queryHash),
      module: CacheModuleName.HOMEPAGE,
      loader: async () => {
        const { data, total } = await this.productsRepository.findPublishedVariantsPaginated({
          page: paginationOptions.page,
          limit: paginationOptions.limit,
          search: paginationOptions.search,
          sortBy: paginationOptions.sortBy,
          sortOrder: paginationOptions.sortOrder,
          productType: query.productType,
          categoryId: filters.categoryId,
          brandId: filters.brandId,
          brandIds: filters.brandIds,
          productNatureId: filters.productNatureId,
          healthConcernId: filters.healthConcernId,
          wellnessGoalId: filters.wellnessGoalId,
          variantSlug: query.variantSlug,
          categoryFilterCriteria: filters.categoryFilterCriteria,
          minPrice: priceRange?.minPrice,
          maxPrice: priceRange?.maxPrice,
        });
        this.logger.log(`[PERF] searchVariants | DB query: ${Date.now() - tDb}ms`);
        return buildPaginatedResult(
          mapVariantEntitiesToPublicSearchItems(data),
          total,
          paginationOptions,
        );
      },
    });
    const tEnrich = Date.now();
    const result = await this.enrichPaginatedVariantSearch(raw);
    const imageCount = result.data.filter((v) => v.primaryImageUrl).length;
    this.logger.log(
      `[PERF] searchVariants | Image URL signing (${imageCount} images): ${Date.now() - tEnrich}ms | TOTAL: ${Date.now() - tDb}ms`,
    );
    return result;
  }

  async findBySlug(slug: string): Promise<IPublicProductDetail> {
    const tDb = Date.now();
    const raw = await this.cacheStrategy.cacheAside({
      key: CacheKeys.publicProducts.detail(slug),
      module: CacheModuleName.HOMEPAGE,
      loader: async () => {
        const byProductSlug = await this.productsRepository.findPublishedBySlug(slug);
        if (byProductSlug) {
          const detail = mapProductEntityToPublicDetail(byProductSlug);
          const matchedVariant =
            detail.variants.find((variant) => variant.slug === slug) ??
            pickPreferredPublicVariant(detail.variants);
          this.logger.log(`[PERF] findBySlug | DB query: ${Date.now() - tDb}ms`);
          return matchedVariant
            ? {
                ...detail,
                selectedVariantId: matchedVariant.id,
                selectedVariantSlug: matchedVariant.slug,
              }
            : detail;
        }

        const byVariantSlug = await this.productsRepository.findPublishedByVariantSlug(slug);
        if (!byVariantSlug) {
          throw new NotFoundException(`Product with slug "${slug}" not found`);
        }

        const detail = mapProductEntityToPublicDetail(byVariantSlug);
        const matchedVariant = detail.variants.find((variant) => variant.slug === slug);
        this.logger.log(`[PERF] findBySlug (via variant) | DB query: ${Date.now() - tDb}ms`);
        return {
          ...detail,
          selectedVariantId: matchedVariant?.id ?? null,
          selectedVariantSlug: matchedVariant?.slug ?? slug,
        };
      },
    });
    const tEnrich = Date.now();
    const result = await this.enrichDetail(raw);
    const imageCount =
      result.media.filter((m) => m.url).length + result.wellnessGoals.filter((g) => g.image).length;
    this.logger.log(
      `[PERF] findBySlug slug="${slug}" | Image URL signing (${imageCount} images): ${Date.now() - tEnrich}ms | TOTAL: ${Date.now() - tDb}ms`,
    );
    this.logFindBySlugUrls(slug, raw, result);
    return result;
  }

  private logFindBySlugUrls(
    slug: string,
    raw: IPublicProductDetail,
    result: IPublicProductDetail,
  ): void {
    this.logger.log(
      `[findBySlug] response summary slug="${slug}" refId="${result.refId}" name="${result.name}" variantCount=${result.variants.length} mediaCount=${result.media.length}`,
    );

    result.media.forEach((item, index) => {
      const rawRef = raw.media[index]?.url;
      this.logger.log(
        `[findBySlug] media[${index}] id=${item.id} type=${item.type} isPrimary=${item.isPrimary} | raw=${this.formatFileRef(rawRef)} | response=${this.formatFileRef(item.url)}`,
      );
    });

    result.wellnessGoals.forEach((goal, index) => {
      const rawRef = raw.wellnessGoals[index]?.image;
      this.logger.log(
        `[findBySlug] wellnessGoal[${index}] refId=${goal.refId} name="${goal.name}" | raw=${this.formatFileRef(rawRef)} | response=${this.formatFileRef(goal.image)}`,
      );
    });

    if (result.sizeChart || raw.sizeChart) {
      this.logger.log(
        `[findBySlug] sizeChart | raw=${this.formatFileRef(raw.sizeChart)} | response=${this.formatFileRef(result.sizeChart)}`,
      );
    }

    for (const party of ['manufacturer', 'packer', 'importer'] as const) {
      const rawParty = raw[party];
      const enrichedParty = result[party];
      if (!rawParty && !enrichedParty) continue;
      this.logger.log(
        `[findBySlug] ${party} refId="${enrichedParty?.refId ?? rawParty?.refId ?? ''}" | rawLogo=${this.formatFileRef(rawParty?.logo)} | responseLogo=${this.formatFileRef(enrichedParty?.logo)}`,
      );
    }
  }

  private formatFileRef(value: unknown): string {
    if (!value) return '(empty)';
    if (typeof value === 'string') {
      return `string key="${value.slice(0, 80)}${value.length > 80 ? '…' : ''}"`;
    }
    if (typeof value === 'object' && value !== null && 'key' in value) {
      const ref = value as { key?: string; name?: string; url?: string };
      const urlPreview = ref.url
        ? `"${ref.url.slice(0, 100)}${ref.url.length > 100 ? '…' : ''}"`
        : '(no url)';
      return `{ key="${ref.key ?? ''}", name="${ref.name ?? ''}", url=${urlPreview} }`;
    }
    return '(unrecognized)';
  }

  private async resolveBrandFilters(
    query: PublicProductQueryDto,
  ): Promise<{ brandId?: string; brandIds?: string[] }> {
    if (query.brandRefId) {
      const brand = await this.brandsRepository.findByRefId(query.brandRefId);
      if (!brand) {
        throw new NotFoundException(`Brand with refId "${query.brandRefId}" not found`);
      }
      return { brandId: brand.id };
    }

    if (!query.brandSlug?.trim()) {
      return {};
    }

    const slugs = [
      ...new Set(
        query.brandSlug
          .split(',')
          .map((slug) => slug.trim())
          .filter(Boolean),
      ),
    ];

    if (slugs.length === 0) {
      return {};
    }

    if (slugs.length === 1) {
      const brand = await this.brandsRepository.findBySlug(slugs[0]);
      if (!brand) {
        throw new NotFoundException(`Brand with slug "${slugs[0]}" not found`);
      }
      return { brandId: brand.id };
    }

    const brands = await this.brandsRepository.findBySlugs(slugs);
    const foundSlugs = new Set(brands.map((brand) => brand.slug));
    const missingSlugs = slugs.filter((slug) => !foundSlugs.has(slug));
    if (missingSlugs.length > 0) {
      throw new NotFoundException(
        `Brand with slug "${missingSlugs.join('", "')}" not found`,
      );
    }

    return { brandIds: brands.map((brand) => brand.id) };
  }

  private async resolveListFilters(query: PublicProductQueryDto) {
    const queryBindings = parseCategoryFilterQueryBindings(query);
    const [category, brandFilters, nature, healthConcern, wellnessGoal, categoryFilterCriteria] =
      await Promise.all([
        query.categoryRefId
          ? this.categoriesRepository.findActiveByRefId(query.categoryRefId)
          : query.categorySlug
            ? this.categoriesRepository.findActiveBySlug(query.categorySlug)
            : Promise.resolve(null),
        this.resolveBrandFilters(query),
        query.productNatureRefId
          ? this.productNaturesRepository.findByRefId(query.productNatureRefId)
          : Promise.resolve(null),
        query.healthConcernRefId
          ? this.healthConcernsRepository.findByRefId(query.healthConcernRefId)
          : query.healthConcernSlug
            ? this.healthConcernsRepository.findBySlug(query.healthConcernSlug)
            : Promise.resolve(null),
        query.wellnessGoalRefId
          ? this.wellnessGoalsRepository.findByRefId(query.wellnessGoalRefId)
          : Promise.resolve(null),
        queryBindings
          ? this.masterResolver.resolveCategoryFilterBindings(queryBindings)
          : Promise.resolve(undefined),
      ]);

    if ((query.categoryRefId || query.categorySlug) && !category) {
      throw new NotFoundException(
        query.categoryRefId
          ? `Category with refId "${query.categoryRefId}" not found`
          : `Category with slug "${query.categorySlug}" not found`,
      );
    }

    if ((query.healthConcernRefId || query.healthConcernSlug) && !healthConcern) {
      throw new NotFoundException(
        query.healthConcernRefId
          ? `Health concern with refId "${query.healthConcernRefId}" not found`
          : `Health concern with slug "${query.healthConcernSlug}" not found`,
      );
    }

    return {
      categoryId: category?.id,
      brandId: brandFilters.brandId,
      brandIds: brandFilters.brandIds,
      productNatureId: nature?.id,
      healthConcernId: healthConcern?.id,
      wellnessGoalId: wellnessGoal?.id,
      categoryFilterCriteria,
      category,
    };
  }

  private async buildCategoryListingContext(
    category: CategoryEntity,
  ): Promise<IPublicCategoryProductListingContext> {
    const matchedCategory =
      (await this.categoriesRepository.findActiveByRefId(category.refId)) ?? category;
    const rootCategory =
      (await this.categoriesRepository.findRootAncestor(matchedCategory.id)) ?? matchedCategory;
    const isChildFilter =
      Number(matchedCategory.hierarchyLevel) !== CategoryHierarchyLevel.ROOT;

    const activeFilters = (rootCategory.categoryFilters ?? []).filter(
      (filter) => filter.status === MasterStatus.ACTIVE,
    );

    const facetRows = await this.productsRepository.findCategoryFilterFacetValues(
      rootCategory.id,
      activeFilters.map((filter) => filter.id),
    );

    const valuesByFilterId = new Map<string, string[]>();
    for (const row of facetRows) {
      const filterId = row.categoryFilterId;
      if (!filterId) continue;
      const existing = valuesByFilterId.get(filterId) ?? [];
      if (!existing.includes(row.value)) {
        existing.push(row.value);
      }
      valuesByFilterId.set(filterId, existing);
    }

    const context: IPublicCategoryProductListingContext = {
      refId: rootCategory.refId,
      name: rootCategory.name,
      slug: rootCategory.slug,
      image: isChildFilter && matchedCategory.image ? matchedCategory.image : rootCategory.image,
      banner: isChildFilter && matchedCategory.banner ? matchedCategory.banner : rootCategory.banner,
      aboveTheFold:
        isChildFilter && matchedCategory.aboveTheFold?.trim()
          ? matchedCategory.aboveTheFold
          : rootCategory.aboveTheFold,
      belowTheFold:
        isChildFilter && matchedCategory.belowTheFold?.trim()
          ? matchedCategory.belowTheFold
          : rootCategory.belowTheFold,
      categoryFilters: activeFilters.map((filter) => {
        const productValues = valuesByFilterId.get(filter.id) ?? [];
        const masterValues = (filter.values ?? [])
          .map((value) => String(value).trim())
          .filter(Boolean);

        return {
          refId: filter.refId,
          name: filter.name,
          values: productValues.length > 0 ? productValues : masterValues,
        };
      }),
      selectedCategory: isChildFilter
        ? {
            refId: matchedCategory.refId,
            name: matchedCategory.name,
            slug: matchedCategory.slug,
          }
        : null,
    };

    return this.storageUrlEnricher.enrichFields(context, ['image', 'banner']);
  }

  private async enrichPaginatedVariantSearch(
    result: PaginatedResult<IPublicProductVariantSearchItem>,
  ): Promise<PaginatedResult<IPublicProductVariantSearchItem>> {
    return {
      ...result,
      data: await Promise.all(result.data.map((item) => this.enrichVariantSearchItem(item))),
    };
  }

  private async enrichVariantSearchItem(
    item: IPublicProductVariantSearchItem,
  ): Promise<IPublicProductVariantSearchItem> {
    return {
      ...item,
      stock: getSalableStockQuantity(item.stock),
      inStock: isVariantInStock(item.stock),
      primaryImageUrl: await this.storageUrlEnricher.toReference(item.primaryImageUrl),
    };
  }

  private async enrichPaginatedCards(
    result: PaginatedResult<IPublicProductCard>,
  ): Promise<PaginatedResult<IPublicProductCard>> {
    // Resolve all primary images in parallel and log each key's signing time
    const data = await Promise.all(
      result.data.map(async (card) => {
        const pricing = {
          ...card.pricing,
          inStock: card.pricing.inStock || isVariantInStock(0),
        };

        if (!card.primaryImageUrl) {
          return { ...card, pricing };
        }

        const key =
          typeof card.primaryImageUrl === 'string'
            ? card.primaryImageUrl
            : ((card.primaryImageUrl as { key?: string }).key ?? '(unknown)');
        const t = Date.now();
        const primaryImageUrl = await this.storageUrlEnricher.toReference(card.primaryImageUrl);
        this.logger.log(`  [IMG] key="${key}" signing=${Date.now() - t}ms`);
        return {
          ...card,
          primaryImageUrl,
          pricing,
        };
      }),
    );
    return { ...result, data };
  }

  private async enrichCard(card: IPublicProductCard): Promise<IPublicProductCard> {
    return {
      ...card,
      primaryImageUrl: await this.storageUrlEnricher.toReference(card.primaryImageUrl),
      pricing: {
        ...card.pricing,
        inStock: card.pricing.inStock || isVariantInStock(0),
      },
    };
  }

  private async enrichDetail(product: IPublicProductDetail): Promise<IPublicProductDetail> {
    const media = await Promise.all(
      product.media.map(async (item) => {
        if (!item.url) return item;
        const enrichedUrl = await this.storageUrlEnricher.toReference(item.url);
        return enrichedUrl ? { ...item, url: enrichedUrl } : item;
      }),
    );

    const wellnessGoals = await Promise.all(
      product.wellnessGoals.map(async (goal) => {
        if (!goal.image) return goal;
        const enrichedImage = await this.storageUrlEnricher.toReference(goal.image);
        return enrichedImage ? { ...goal, image: enrichedImage } : goal;
      }),
    );

    const labelSortOrders =
      await this.productInformationLabelsRepository.findActiveSortOrdersByName();
    const productInformation = enrichProductInformation(
      product.productInformation,
      labelSortOrders,
    );
    const sizeChart = product.sizeChart
      ? await this.storageUrlEnricher.toReference(product.sizeChart)
      : null;
    const manufacturer = product.manufacturer
      ? await this.enrichPartySummary(product.manufacturer)
      : null;
    const packer = product.packer ? await this.enrichPartySummary(product.packer) : null;
    const importer = product.importer ? await this.enrichPartySummary(product.importer) : null;

    const variants = await Promise.all(
      product.variants.map(async (variant) => {
        const variantSizeChart = variant.sizeChart
          ? await this.storageUrlEnricher.toReference(variant.sizeChart)
          : null;
        return {
          ...variant,
          productInformation: enrichProductInformation(
            variant.productInformation,
            labelSortOrders,
          ),
          sizeChart: variantSizeChart,
          expiryDate: resolvePublicExpiryDate(
            variant.expiryDate,
            variant.expiresInMonths ?? product.expiresInMonths,
          ),
        };
      }),
    );

    const merged = applySelectedVariantDetailToPublicProduct({
      ...product,
      media,
      wellnessGoals,
      productInformation,
      sizeChart,
      manufacturer,
      packer,
      importer,
      variants,
    });

    // Re-apply live master order after variant merge (variant payload may replace product info).
    return {
      ...merged,
      productInformation: enrichProductInformation(
        merged.productInformation,
        labelSortOrders,
      ),
    };
  }

  private async enrichPartySummary<
    T extends IPublicManufacturerSummary | IPublicPackerSummary | IPublicImporterSummary,
  >(party: T): Promise<T> {
    return this.storageUrlEnricher.enrichFields(party, ['logo']);
  }
}
