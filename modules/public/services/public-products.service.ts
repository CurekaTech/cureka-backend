import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  PaginatedResult,
} from '@packages/common';
import {
  buildQueryCacheHash,
  CacheKeys,
  CacheModuleName,
  CacheStrategyService,
} from '@packages/cache';
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
import { PublicProductQueryDto } from '../dto/public-product-query.dto';
import {
  IPublicImporterSummary,
  IPublicManufacturerSummary,
  IPublicPackerSummary,
  IPublicProductCard,
  IPublicProductDetail,
  IPublicProductVariantSearchItem,
} from '../interfaces/public-product.interface';
import {
  mapProductEntitiesToPublicCards,
  mapProductEntityToPublicDetail,
  mapVariantEntitiesToPublicSearchItems,
} from '../mappers/public-product.mapper';

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

  async findAll(query: PublicProductQueryDto): Promise<PaginatedResult<IPublicProductCard>> {
    const paginationOptions = buildPaginationOptions(query);
    const filters = await this.resolveListFilters(query);
    const queryHash = buildQueryCacheHash({
      ...filters,
      categoryRefId: query.categoryRefId,
      categorySlug: query.categorySlug,
      brandRefId: query.brandRefId,
      brandSlug: query.brandSlug,
      healthConcernRefId: query.healthConcernRefId,
      healthConcernSlug: query.healthConcernSlug,
      productNatureRefId: query.productNatureRefId,
      wellnessGoalRefId: query.wellnessGoalRefId,
      variantSlug: query.variantSlug,
      categoryFilterCriteria: filters.categoryFilterCriteria,
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
          productNatureId: filters.productNatureId,
          healthConcernId: filters.healthConcernId,
          wellnessGoalId: filters.wellnessGoalId,
          variantSlug: query.variantSlug,
          categoryFilterCriteria: filters.categoryFilterCriteria,
        });
        this.logger.log(`[PERF] findAll | DB query: ${Date.now() - tDb}ms`);
        return buildPaginatedResult(mapProductEntitiesToPublicCards(data), total, paginationOptions);
      },
    });
    const tEnrich = Date.now();
    const result = await this.enrichPaginatedCards(raw);
    const imageCount = result.data.filter((c) => c.primaryImageUrl).length;
    this.logger.log(
      `[PERF] findAll | Image URL signing (${imageCount} images): ${Date.now() - tEnrich}ms | TOTAL: ${Date.now() - tDb}ms`,
    );
    return result;
  }

  async searchVariants(
    query: PublicProductQueryDto,
  ): Promise<PaginatedResult<IPublicProductVariantSearchItem>> {
    const paginationOptions = buildPaginationOptions(query);
    const filters = await this.resolveListFilters(query);
    const queryHash = buildQueryCacheHash({
      ...filters,
      categoryRefId: query.categoryRefId,
      categorySlug: query.categorySlug,
      brandRefId: query.brandRefId,
      brandSlug: query.brandSlug,
      healthConcernRefId: query.healthConcernRefId,
      healthConcernSlug: query.healthConcernSlug,
      productNatureRefId: query.productNatureRefId,
      wellnessGoalRefId: query.wellnessGoalRefId,
      variantSlug: query.variantSlug,
      categoryFilterCriteria: filters.categoryFilterCriteria,
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
          productNatureId: filters.productNatureId,
          healthConcernId: filters.healthConcernId,
          wellnessGoalId: filters.wellnessGoalId,
          variantSlug: query.variantSlug,
          categoryFilterCriteria: filters.categoryFilterCriteria,
        });
        this.logger.log(`[PERF] searchVariants | DB query: ${Date.now() - tDb}ms`);
        return buildPaginatedResult(mapVariantEntitiesToPublicSearchItems(data), total, paginationOptions);
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
            detail.variants[0];
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
    const imageCount = result.media.filter((m) => m.url).length + result.wellnessGoals.filter((g) => g.image).length;
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

  private async resolveListFilters(query: PublicProductQueryDto) {
    const queryBindings = parseCategoryFilterQueryBindings(query);
    const [category, brand, nature, healthConcern, wellnessGoal, categoryFilterCriteria] =
      await Promise.all([
      query.categoryRefId
        ? this.categoriesRepository.findByRefId(query.categoryRefId)
        : query.categorySlug
          ? this.categoriesRepository.findBySlug(query.categorySlug)
          : Promise.resolve(null),
      query.brandRefId
        ? this.brandsRepository.findByRefId(query.brandRefId)
        : query.brandSlug
          ? this.brandsRepository.findBySlug(query.brandSlug)
          : Promise.resolve(null),
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

    return {
      categoryId: category?.id,
      brandId: brand?.id,
      productNatureId: nature?.id,
      healthConcernId: healthConcern?.id,
      wellnessGoalId: wellnessGoal?.id,
      categoryFilterCriteria,
    };
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
      primaryImageUrl: await this.storageUrlEnricher.toReference(item.primaryImageUrl),
    };
  }

  private async enrichPaginatedCards(
    result: PaginatedResult<IPublicProductCard>,
  ): Promise<PaginatedResult<IPublicProductCard>> {
    // Resolve all primary images in parallel and log each key's signing time
    const data = await Promise.all(
      result.data.map(async (card) => {
        if (!card.primaryImageUrl) return card;
        const key = typeof card.primaryImageUrl === 'string'
          ? card.primaryImageUrl
          : (card.primaryImageUrl as { key?: string }).key ?? '(unknown)';
        const t = Date.now();
        const primaryImageUrl = await this.storageUrlEnricher.toReference(card.primaryImageUrl);
        this.logger.log(`  [IMG] key="${key}" signing=${Date.now() - t}ms`);
        return { ...card, primaryImageUrl };
      }),
    );
    return { ...result, data };
  }

  private async enrichCard(card: IPublicProductCard): Promise<IPublicProductCard> {
    return {
      ...card,
      primaryImageUrl: await this.storageUrlEnricher.toReference(card.primaryImageUrl),
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

    const productInformation = await this.enrichProductInformation(product.productInformation);
    const sizeChart = product.sizeChart
      ? await this.storageUrlEnricher.toReference(product.sizeChart)
      : null;
    const manufacturer = product.manufacturer
      ? await this.enrichPartySummary(product.manufacturer)
      : null;
    const packer = product.packer ? await this.enrichPartySummary(product.packer) : null;
    const importer = product.importer ? await this.enrichPartySummary(product.importer) : null;

    return {
      ...product,
      media,
      wellnessGoals,
      productInformation,
      sizeChart,
      manufacturer,
      packer,
      importer,
    };
  }

  private async enrichPartySummary<
    T extends IPublicManufacturerSummary | IPublicPackerSummary | IPublicImporterSummary,
  >(party: T): Promise<T> {
    return this.storageUrlEnricher.enrichFields(party, ['logo']);
  }

  private async enrichProductInformation(
    items: IPublicProductDetail['productInformation'],
  ): Promise<IPublicProductDetail['productInformation']> {
    const labelSortOrders = await this.productInformationLabelsRepository.findActiveSortOrdersByName();
    return enrichProductInformation(items, labelSortOrders);
  }
}
