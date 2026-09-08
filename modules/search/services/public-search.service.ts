import { Injectable, Logger } from '@nestjs/common';
import { AdminSettingsService } from '@modules/admin-settings/services/admin-settings.service';
import { CacheKeys, CacheModuleName, CacheStrategyService } from '@packages/cache';
import { BrandsRepository } from '@modules/master/repositories/brands.repository';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { HealthConcernsRepository } from '@modules/master/repositories/health-concerns.repository';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import {
  SEARCH_ENTITY_TYPES,
  SearchEntityType,
} from '../constants/search-entity-type.constant';
import {
  SEARCH_ENTITY_FETCH_LIMIT,
  SEARCH_NATIVE_FALLBACK_MIN_CHARS,
  SEARCH_RESPONSE_CACHE_MAX_ENTRIES,
  SEARCH_RESPONSE_CACHE_TTL_MS,
  SEARCH_POPULAR_CACHE_TTL_SECONDS,
  TYPESENSE_FAST_SEARCH_PARAMS,
} from '../constants/typesense-search-performance.constant';
import { PRODUCT_POPULAR_SORT_FIELD } from '../constants/typesense-product.schema';
import { IPublicSearchResult } from '../interfaces/public-search-result.interface';
import {
  mapBrandToSearchResult,
  mapCategoryToSearchResult,
  mapHealthConcernToSearchResult,
  mapVariantToSearchResult,
} from '../mappers/public-search-result.mapper';
import { mapTypesenseHitsToSearchResults, filterDistinctMatchingProductVariants } from '../mappers/typesense-search-result.mapper';
import { TypesenseClientService } from './typesense-client.service';
import { TypesenseCollectionService } from './typesense-collection.service';

type SearchCacheEntry = {
  expiresAt: number;
  data: IPublicSearchResult[];
};

type MultiSearchResponse = {
  results?: Array<{
    hits?: Array<{ document?: Record<string, unknown> }>;
  }>;
};

const DROPDOWN_ENTITY_ORDER: SearchEntityType[] = [
  SEARCH_ENTITY_TYPES.CATEGORY,
  SEARCH_ENTITY_TYPES.BRAND,
  SEARCH_ENTITY_TYPES.HEALTH_CONCERN,
  SEARCH_ENTITY_TYPES.PRODUCT,
];

@Injectable()
export class PublicSearchService {
  private readonly logger = new Logger(PublicSearchService.name);
  private readonly searchCache = new Map<string, SearchCacheEntry>();

  constructor(
    private readonly typesenseClient: TypesenseClientService,
    private readonly collectionService: TypesenseCollectionService,
    private readonly adminSettingsService: AdminSettingsService,
    private readonly productsRepository: ProductsRepository,
    private readonly brandsRepository: BrandsRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly healthConcernsRepository: HealthConcernsRepository,
    private readonly cacheStrategy: CacheStrategyService,
  ) {}

  async search(query: string, perPage = 10): Promise<IPublicSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const useTypesense = await this.shouldUseTypesense();
    const cacheKey = this.buildCacheKey(trimmed, perPage, useTypesense);
    const cached = this.readCache(cacheKey);
    if (cached) {
      return cached;
    }

    if (useTypesense) {
      try {
        const merged = await this.searchWithTypesense(trimmed, perPage);
        this.writeCache(cacheKey, merged);
        return merged;
      } catch (error) {
        this.logger.warn(
          {
            query: trimmed,
            error: error instanceof Error ? error.message : String(error),
          },
          '[Search] Typesense dropdown failed — using native search fallback',
        );
      }
    }

    if (trimmed.length < SEARCH_NATIVE_FALLBACK_MIN_CHARS) {
      return [];
    }

    const fallback = await this.searchWithNative(trimmed, perPage);
    this.writeCache(cacheKey, fallback);
    return fallback;
  }

  async getPopular(perPage = 4): Promise<IPublicSearchResult[]> {
    if (!(await this.shouldUseTypesense())) {
      return [];
    }

    const normalizedPerPage = Math.min(Math.max(1, perPage), 30);
    return this.cacheStrategy.cacheAside({
      key: CacheKeys.publicSearch.popular(normalizedPerPage),
      module: CacheModuleName.DEFAULT,
      ttlSeconds: SEARCH_POPULAR_CACHE_TTL_SECONDS,
      loader: () => this.loadPopularFromTypesense(normalizedPerPage),
    });
  }

  private async loadPopularFromTypesense(perPage: number): Promise<IPublicSearchResult[]> {
    const config = await this.collectionService.getSearchRuntimeConfig();
    const collectionName = this.typesenseClient.getCollectionName();
    const filterBy = config.hasEntityType
      ? config.entityTypeFilters[SEARCH_ENTITY_TYPES.PRODUCT]
      : undefined;

    try {
      const result = await this.typesenseClient
        .getSearchClient()
        .collections(collectionName)
        .documents()
        .search({
          q: '*',
          query_by: 'name',
          per_page: Math.min(perPage * 3, 30),
          exhaustive_search: false,
          ...(filterBy ? { filter_by: filterBy } : {}),
          ...(config.hasPopularSortField
            ? { sort_by: `${PRODUCT_POPULAR_SORT_FIELD}:asc` }
            : {}),
        });

      return filterDistinctMatchingProductVariants(
        mapTypesenseHitsToSearchResults(
          (result.hits ?? []) as Array<{ document?: Record<string, unknown> }>,
        ),
      ).slice(0, perPage);
    } catch (error) {
      this.logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        '[Search] Typesense popular failed — returning empty',
      );
      return [];
    }
  }

  /**
   * Admin Store Configuration `enableTypesense` AND Typesense env/client must both be on.
   * Otherwise search uses native Postgres fallback; popular returns [].
   */
  private async shouldUseTypesense(): Promise<boolean> {
    if (!this.typesenseClient.isEnabled()) {
      return false;
    }
    return this.adminSettingsService.isTypesenseSearchEnabled();
  }

  private async searchWithTypesense(trimmed: string, perPage: number): Promise<IPublicSearchResult[]> {
    const config = await this.collectionService.getSearchRuntimeConfig();
    const collectionName = this.typesenseClient.getCollectionName();
    const entityLimit = Math.min(perPage, SEARCH_ENTITY_FETCH_LIMIT);
    const searches = DROPDOWN_ENTITY_ORDER.flatMap((entityType) => {
      if (!config.hasEntityType && entityType !== SEARCH_ENTITY_TYPES.PRODUCT) {
        return [];
      }

      const filterBy = config.entityTypeFilters[entityType];
      const isProduct = entityType === SEARCH_ENTITY_TYPES.PRODUCT;

      return [
        {
          collection: collectionName,
          q: trimmed,
          query_by: isProduct ? config.productQueryBy : config.entityQueryBy,
          per_page: isProduct ? Math.min(perPage * 3, 30) : entityLimit,
          ...TYPESENSE_FAST_SEARCH_PARAMS,
          ...(filterBy ? { filter_by: filterBy } : {}),
        },
      ];
    });

    const multiResult = (await this.typesenseClient
      .getSearchClient()
      .multiSearch.perform({ searches })) as MultiSearchResponse;

    const grouped = this.groupMultiSearchResults(multiResult, config.hasEntityType);
    return this.mergeSearchResults(
      grouped[SEARCH_ENTITY_TYPES.CATEGORY] ?? [],
      grouped[SEARCH_ENTITY_TYPES.BRAND] ?? [],
      grouped[SEARCH_ENTITY_TYPES.HEALTH_CONCERN] ?? [],
      filterDistinctMatchingProductVariants(
        grouped[SEARCH_ENTITY_TYPES.PRODUCT] ?? [],
        trimmed,
      ),
      perPage,
    );
  }

  private async searchWithNative(trimmed: string, perPage: number): Promise<IPublicSearchResult[]> {
    const entityLimit = Math.min(perPage, SEARCH_ENTITY_FETCH_LIMIT);
    const productLimit = Math.min(perPage * 3, 30);
    const pagination = { page: 1, limit: entityLimit, search: trimmed, sortBy: 'name', sortOrder: 'ASC' as const };

    const [categories, brands, healthConcerns, variants] = await Promise.all([
      this.categoriesRepository.findPublicPaginated(pagination),
      this.brandsRepository.findPublicPaginated(pagination),
      this.healthConcernsRepository.findPublicPaginated(pagination),
      this.productsRepository.findPublishedDropdownSuggestions(trimmed, productLimit),
    ]);

    const products = filterDistinctMatchingProductVariants(
      variants
        .map((variant) => mapVariantToSearchResult(variant))
        .filter((result): result is IPublicSearchResult => Boolean(result)),
      trimmed,
    );

    return this.mergeSearchResults(
      categories.data
        .filter((category) => category.status === MasterStatus.ACTIVE)
        .map(mapCategoryToSearchResult),
      brands.data
        .filter((brand) => brand.status === MasterStatus.ACTIVE)
        .map(mapBrandToSearchResult),
      healthConcerns.data
        .filter((healthConcern) => healthConcern.status === MasterStatus.ACTIVE)
        .map(mapHealthConcernToSearchResult),
      products,
      perPage,
    );
  }

  private groupMultiSearchResults(
    multiResult: MultiSearchResponse,
    hasEntityType: boolean,
  ): Partial<Record<SearchEntityType, IPublicSearchResult[]>> {
    const grouped: Partial<Record<SearchEntityType, IPublicSearchResult[]>> = {};
    const responses = multiResult.results ?? [];

    if (!hasEntityType) {
      grouped[SEARCH_ENTITY_TYPES.PRODUCT] = mapTypesenseHitsToSearchResults(
        responses[0]?.hits ?? [],
      );
      return grouped;
    }

    DROPDOWN_ENTITY_ORDER.forEach((entityType, index) => {
      grouped[entityType] = mapTypesenseHitsToSearchResults(responses[index]?.hits ?? []);
    });

    return grouped;
  }

  private mergeSearchResults(
    categories: IPublicSearchResult[],
    brands: IPublicSearchResult[],
    healthConcerns: IPublicSearchResult[],
    products: IPublicSearchResult[],
    perPage: number,
  ): IPublicSearchResult[] {
    const results: IPublicSearchResult[] = [];

    const append = (items: IPublicSearchResult[]) => {
      for (const item of items) {
        if (results.length >= perPage) {
          return;
        }
        results.push(item);
      }
    };

    append(categories);
    append(brands);
    append(healthConcerns);
    append(products);

    return results;
  }

  private buildCacheKey(query: string, perPage: number, useTypesense: boolean): string {
    return `${useTypesense ? 'ts' : 'native'}\0${query.toLowerCase()}\0${perPage}`;
  }

  private readCache(cacheKey: string): IPublicSearchResult[] | null {
    const entry = this.searchCache.get(cacheKey);
    if (!entry) {
      return null;
    }

    if (Date.now() >= entry.expiresAt) {
      this.searchCache.delete(cacheKey);
      return null;
    }

    return entry.data;
  }

  private writeCache(cacheKey: string, data: IPublicSearchResult[]): void {
    if (this.searchCache.size >= SEARCH_RESPONSE_CACHE_MAX_ENTRIES) {
      const oldestKey = this.searchCache.keys().next().value;
      if (oldestKey) {
        this.searchCache.delete(oldestKey);
      }
    }

    this.searchCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + SEARCH_RESPONSE_CACHE_TTL_MS,
    });
  }
}
