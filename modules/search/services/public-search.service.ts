import { Injectable } from '@nestjs/common';
import {
  SEARCH_ENTITY_TYPES,
  SearchEntityType,
} from '../constants/search-entity-type.constant';
import {
  SEARCH_ENTITY_FETCH_LIMIT,
  SEARCH_RESPONSE_CACHE_MAX_ENTRIES,
  SEARCH_RESPONSE_CACHE_TTL_MS,
  TYPESENSE_FAST_SEARCH_PARAMS,
} from '../constants/typesense-search-performance.constant';
import { PRODUCT_POPULAR_SORT_FIELD } from '../constants/typesense-product.schema';
import { IPublicSearchResult } from '../interfaces/public-search-result.interface';
import { mapTypesenseHitsToSearchResults } from '../mappers/typesense-search-result.mapper';
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
  private readonly searchCache = new Map<string, SearchCacheEntry>();

  constructor(
    private readonly typesenseClient: TypesenseClientService,
    private readonly collectionService: TypesenseCollectionService,
  ) {}

  async search(query: string, perPage = 10): Promise<IPublicSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed || !this.typesenseClient.isEnabled()) {
      return [];
    }

    const cacheKey = this.buildCacheKey(trimmed, perPage);
    const cached = this.readCache(cacheKey);
    if (cached) {
      return cached;
    }

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
          per_page: isProduct ? perPage : entityLimit,
          ...TYPESENSE_FAST_SEARCH_PARAMS,
          ...(filterBy ? { filter_by: filterBy } : {}),
        },
      ];
    });

    const multiResult = (await this.typesenseClient
      .getSearchClient()
      .multiSearch.perform({ searches })) as MultiSearchResponse;

    const grouped = this.groupMultiSearchResults(multiResult, config.hasEntityType);
    const merged = this.mergeSearchResults(
      grouped[SEARCH_ENTITY_TYPES.CATEGORY] ?? [],
      grouped[SEARCH_ENTITY_TYPES.BRAND] ?? [],
      grouped[SEARCH_ENTITY_TYPES.HEALTH_CONCERN] ?? [],
      grouped[SEARCH_ENTITY_TYPES.PRODUCT] ?? [],
      perPage,
    );

    this.writeCache(cacheKey, merged);
    return merged;
  }

  async getPopular(perPage = 4): Promise<IPublicSearchResult[]> {
    if (!this.typesenseClient.isEnabled()) {
      return [];
    }

    const config = await this.collectionService.getSearchRuntimeConfig();
    const collectionName = this.typesenseClient.getCollectionName();
    const filterBy = config.hasEntityType
      ? config.entityTypeFilters[SEARCH_ENTITY_TYPES.PRODUCT]
      : undefined;

    const result = await this.typesenseClient
      .getSearchClient()
      .collections(collectionName)
      .documents()
      .search({
        q: '*',
        query_by: 'name',
        per_page: perPage,
        exhaustive_search: false,
        ...(filterBy ? { filter_by: filterBy } : {}),
        ...(config.hasPopularSortField
          ? { sort_by: `${PRODUCT_POPULAR_SORT_FIELD}:asc` }
          : {}),
      });

    return mapTypesenseHitsToSearchResults(
      (result.hits ?? []) as Array<{ document?: Record<string, unknown> }>,
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

  private buildCacheKey(query: string, perPage: number): string {
    return `${query.toLowerCase()}\0${perPage}`;
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
