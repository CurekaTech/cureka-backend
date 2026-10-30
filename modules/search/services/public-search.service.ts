import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AdminSettingsService } from '@modules/admin-settings/services/admin-settings.service';
import { CacheKeys, CacheModuleName, CacheStrategyService } from '@packages/cache';
import { BrandsRepository } from '@modules/master/repositories/brands.repository';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { HealthConcernsRepository } from '@modules/master/repositories/health-concerns.repository';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { PincodesService } from '@modules/pincodes/services/pincodes.service';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { EVENTS } from '@packages/events';
import { buildCategoryPermalink } from '@modules/public/utils/category-permalink.util';
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
import { ITypesenseSearchRuntimeConfig } from '../interfaces/typesense-search-runtime-config.interface';
import { IPublicSearchResult } from '../interfaces/public-search-result.interface';
import {
  mapBrandToSearchResult,
  mapCategoryToSearchResult,
  mapHealthConcernToSearchResult,
  mapVariantToSearchResult,
} from '../mappers/public-search-result.mapper';
import { mapTypesenseHitsToSearchResults, filterDistinctMatchingProductVariants, filterDistinctTolerantProductVariants } from '../mappers/typesense-search-result.mapper';
import {
  compactSearchText,
  isGibberishSearchQuery,
  searchQueryNeedsCompactRetry,
  searchQueryOmitsWordBreaks,
  searchTypoBudget,
  significantSearchTokens,
} from '../utils/search-tolerance.util';
import { normalizeSearchQuery, searchQueryTerms, sortBySearchRelevance } from '../utils/search-query.util';
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
    private readonly pincodesService: PincodesService,
  ) {}

  async search(query: string, perPage = 10, pincode?: string): Promise<IPublicSearchResult[]> {
    const trimmed = normalizeSearchQuery(query);
    if (!trimmed) {
      return [];
    }

    const scope = await this.pincodesService.resolveForStorefront(pincode);
    const useTypesense = await this.shouldUseTypesense();
    const cacheKey = this.buildCacheKey(trimmed, perPage, useTypesense, scope.pincode);
    const cached = this.readCache(cacheKey);
    if (cached) {
      return cached;
    }

    if (useTypesense) {
      try {
        const merged = await this.attachCategoryPermalinks(
          await this.searchWithTypesense(trimmed, perPage, scope.pincode, scope.pincodeId),
        );
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

    const fallback = await this.attachCategoryPermalinks(
      await this.searchWithNative(trimmed, perPage, scope.pincodeId),
    );
    this.writeCache(cacheKey, fallback);
    return fallback;
  }

  async getPopular(perPage = 4, pincode?: string): Promise<IPublicSearchResult[]> {
    const normalizedPerPage = Math.min(Math.max(1, perPage), 30);
    const scope = await this.pincodesService.resolveForStorefront(pincode);
    return this.cacheStrategy.cacheAside({
      key: CacheKeys.publicSearch.popular(normalizedPerPage, scope.pincode ?? 'none'),
      module: CacheModuleName.DEFAULT,
      ttlSeconds: SEARCH_POPULAR_CACHE_TTL_SECONDS,
      loader: () => this.loadPopular(normalizedPerPage, scope.pincode, scope.pincodeId),
    });
  }

  /**
   * Popular dropdown: published + sellable products only, one hit per product.
   * Typesense is a candidate source; Postgres is the source of truth for links.
   */
  private async loadPopular(
    perPage: number,
    pincode: string | null,
    pincodeId: string | null,
  ): Promise<IPublicSearchResult[]> {
    if (await this.shouldUseTypesense()) {
      try {
        const fromTypesense = await this.loadPopularFromTypesense(perPage, pincode, pincodeId);
        if (fromTypesense.length >= perPage) {
          return fromTypesense;
        }

        const fromDb = await this.loadPopularFromDb(perPage, pincodeId);
        return this.mergeUniquePopularResults(fromTypesense, fromDb, perPage);
      } catch (error) {
        this.logger.warn(
          {
            error: error instanceof Error ? error.message : String(error),
          },
          '[Search] Typesense popular failed — using published DB fallback',
        );
      }
    }

    return this.loadPopularFromDb(perPage, pincodeId);
  }

  private async loadPopularFromTypesense(
    perPage: number,
    pincode: string | null,
    pincodeId: string | null,
  ): Promise<IPublicSearchResult[]> {
    const config = await this.collectionService.getSearchRuntimeConfig();
    const collectionName = this.typesenseClient.getCollectionName();
    const productFilter = config.entityTypeFilters[SEARCH_ENTITY_TYPES.PRODUCT];
    const filterBy = [
      productFilter,
      config.hasInStock ? 'inStock:true' : undefined,
      this.typesensePincodeClause(config, pincode),
    ]
      .filter(Boolean)
      .join(' && ');
    // Over-fetch: cheapest Typesense docs are often stale OOS that PDP would 404.
    const fetchSize = Math.min(Math.max(perPage * 10, 40), 100);

    const result = await this.typesenseClient
      .getSearchClient()
      .collections(collectionName)
      .documents()
      .search({
        q: '*',
        query_by: 'name',
        per_page: fetchSize,
        exhaustive_search: false,
        ...(filterBy ? { filter_by: filterBy } : {}),
        ...(config.hasPopularSortField
          ? { sort_by: `${PRODUCT_POPULAR_SORT_FIELD}:asc` }
          : {}),
      });

    const candidates = this.dedupePopularByRefId(
      filterDistinctMatchingProductVariants(
        mapTypesenseHitsToSearchResults(
          (result.hits ?? []) as Array<{ document?: Record<string, unknown> }>,
        ),
      ),
    );
    if (!candidates.length) {
      return [];
    }

    return this.resolvePopularFromPublishedProducts(candidates, perPage, pincodeId);
  }

  private async loadPopularFromDb(
    perPage: number,
    pincodeId: string | null,
  ): Promise<IPublicSearchResult[]> {
    const variants = pincodeId
      ? await this.productsRepository.findPublishedPopularVariants(perPage, pincodeId)
      : await this.productsRepository.findPublishedPopularVariants(perPage);
    return variants
      .map((variant) => mapVariantToSearchResult(variant))
      .filter((result): result is IPublicSearchResult => Boolean(result))
      .slice(0, perPage);
  }

  /**
   * Keep Typesense ordering, but only products that are published with at least
   * one sellable variant — rebuild title/slug/productPageUrl from DB so links work.
   */
  private async resolvePopularFromPublishedProducts(
    candidates: IPublicSearchResult[],
    perPage: number,
    pincodeId: string | null,
  ): Promise<IPublicSearchResult[]> {
    const refIds = candidates.map((candidate) => candidate.refId);
    const published = pincodeId
      ? await this.productsRepository.findPublishedByRefIds(refIds, pincodeId)
      : await this.productsRepository.findPublishedByRefIds(refIds);
    const publishedByRefId = new Map(published.map((product) => [product.refId, product]));
    const results: IPublicSearchResult[] = [];

    for (const candidate of candidates) {
      if (results.length >= perPage) {
        break;
      }

      const product = publishedByRefId.get(candidate.refId);
      if (!product?.variants?.length) {
        continue;
      }

      const matchedVariant =
        product.variants.find(
          (variant) =>
            variant.slug === candidate.slug ||
            variant.productPageUrl === candidate.productPageUrl,
        ) ??
        [...product.variants].sort(
          (left, right) =>
            (Number(left.sellingPrice) || 0) - (Number(right.sellingPrice) || 0),
        )[0];

      if (!matchedVariant) {
        continue;
      }

      // Variants from findPublishedByRefIds are not joined with product.
      matchedVariant.product = product;
      const mapped = mapVariantToSearchResult(matchedVariant);
      if (mapped) {
        results.push(mapped);
      }
    }

    return results;
  }

  private dedupePopularByRefId(results: IPublicSearchResult[]): IPublicSearchResult[] {
    const seenRefIds = new Set<string>();
    const unique: IPublicSearchResult[] = [];
    for (const result of results) {
      if (!result.refId || seenRefIds.has(result.refId)) {
        continue;
      }
      seenRefIds.add(result.refId);
      unique.push(result);
    }
    return unique;
  }

  private mergeUniquePopularResults(
    primary: IPublicSearchResult[],
    secondary: IPublicSearchResult[],
    perPage: number,
  ): IPublicSearchResult[] {
    return this.dedupePopularByRefId([...primary, ...secondary]).slice(0, perPage);
  }

  /**
   * Admin Store Configuration `enableTypesense` AND Typesense env/client must both be on.
   * Otherwise search uses native Postgres fallback; popular also falls back to Postgres.
   */
  private async shouldUseTypesense(): Promise<boolean> {
    if (!this.typesenseClient.isEnabled()) {
      return false;
    }
    return this.adminSettingsService.isTypesenseSearchEnabled();
  }

  /** Drop dropdown hits cached before a pincode or catalog change. */
  @OnEvent(EVENTS.PRODUCT_UPDATED)
  clearSearchCache(): void {
    this.searchCache.clear();
  }

  private async searchWithTypesense(
    trimmed: string,
    perPage: number,
    pincode: string | null,
    pincodeId: string | null,
  ): Promise<IPublicSearchResult[]> {
    const config = await this.collectionService.getSearchRuntimeConfig();
    const collectionName = this.typesenseClient.getCollectionName();
    const entityLimit = Math.min(perPage, SEARCH_ENTITY_FETCH_LIMIT);
    const joinWords = searchQueryOmitsWordBreaks(trimmed);
    const searchParams = joinWords
      ? { ...TYPESENSE_FAST_SEARCH_PARAMS, split_join_tokens: 'always' as const, search_cutoff_ms: 250 }
      : TYPESENSE_FAST_SEARCH_PARAMS;
    const searches = DROPDOWN_ENTITY_ORDER.flatMap((entityType) => {
      if (!config.hasEntityType && entityType !== SEARCH_ENTITY_TYPES.PRODUCT) {
        return [];
      }

      const isProduct = entityType === SEARCH_ENTITY_TYPES.PRODUCT;
      const filterBy = isProduct
        ? this.applyProductPincodeFilter(
            config.entityTypeFilters[entityType],
            config,
            pincode,
          )
        : config.entityTypeFilters[entityType];

      return [
        {
          collection: collectionName,
          q: trimmed,
          query_by: isProduct
            ? this.productQueryBy(config, joinWords)
            : joinWords
              ? this.entityQueryBy(config)
              : config.entityQueryBy,
          per_page: isProduct ? Math.min(perPage * 3, 30) : entityLimit,
          ...searchParams,
          ...(filterBy ? { filter_by: filterBy } : {}),
          ...(isProduct && config.hasInStock
            ? { sort_by: 'inStock:desc,_text_match:desc' }
            : {}),
        },
      ];
    });

    const fullSearchCount = searches.length;
    const productFilterBy = this.applyProductPincodeFilter(
      config.entityTypeFilters[SEARCH_ENTITY_TYPES.PRODUCT],
      config,
      pincode,
    );
    const terms = searchQueryTerms(trimmed);
    for (const term of terms) {
      if (term !== trimmed) {
        searches.push({
          collection: collectionName,
          q: term,
          query_by: config.productQueryBy,
          per_page: Math.min(perPage * 2, 30),
          ...TYPESENSE_FAST_SEARCH_PARAMS,
          ...(productFilterBy ? { filter_by: productFilterBy } : {}),
          ...(config.hasInStock ? { sort_by: 'inStock:desc,_text_match:desc' } : {}),
        });
      }
    }

    const multiResult = (await this.typesenseClient
      .getSearchClient()
      .multiSearch.perform({ searches })) as MultiSearchResponse;

    const grouped = this.groupMultiSearchResults(multiResult, config.hasEntityType);
    const rawProducts = grouped[SEARCH_ENTITY_TYPES.PRODUCT] ?? [];
    const extraProductHits = (multiResult.results ?? [])
      .slice(fullSearchCount)
      .flatMap((response) =>
        mapTypesenseHitsToSearchResults(
          (response.hits ?? []) as Array<{ document?: Record<string, unknown> }>,
        ),
      );
    const allProductHits = [...rawProducts, ...extraProductHits];
    const strictProducts = filterDistinctMatchingProductVariants(allProductHits);
    // Pincode can drop a real text match. Do not replace that with a fuzzy catalog.
    let productHits = strictProducts.length
      ? await this.retainProductsVisibleForPincode(strictProducts, pincodeId)
      : [];

    if (config.hasSearchText && productHits.length < perPage) {
      const infixSearches = terms.map((term) => ({
        collection: collectionName,
        q: term,
        query_by: 'searchText',
        per_page: Math.min(Math.max(perPage - productHits.length, 1) * 3, 30),
        ...TYPESENSE_FAST_SEARCH_PARAMS,
        num_typos: 0,
        prefix: false,
        infix: 'always',
        search_cutoff_ms: 250,
        ...(productFilterBy ? { filter_by: productFilterBy } : {}),
        ...(config.hasInStock ? { sort_by: 'inStock:desc,_text_match:desc' } : {}),
      }));
      const infixResult = (await this.typesenseClient
        .getSearchClient()
        .multiSearch.perform({ searches: infixSearches as unknown as typeof searches })) as MultiSearchResponse;
      const infixHits = (infixResult.results ?? []).flatMap((response) =>
        mapTypesenseHitsToSearchResults(
          (response.hits ?? []) as Array<{ document?: Record<string, unknown> }>,
        ),
      );
      const infixProducts = await this.retainProductsVisibleForPincode(
        filterDistinctMatchingProductVariants(infixHits),
        pincodeId,
      );
      productHits = this.mergeProductHits(productHits, infixProducts);
    }

    if (!productHits.length) {
      productHits = await this.loadPublishedProductHits(trimmed, perPage, pincodeId);
    } else if (joinWords && productHits.length < perPage) {
      const nativeHits = await this.loadPublishedProductHits(trimmed, perPage, pincodeId);
      productHits = this.mergeProductHits(productHits, nativeHits);
    }
    if (!productHits.length) {
      productHits = await this.recoverTolerantProductHits(
        trimmed,
        perPage,
        config,
        pincode,
        pincodeId,
        rawProducts,
      );
    }

    const entities = strictProducts.length
      ? {
          [SEARCH_ENTITY_TYPES.CATEGORY]: grouped[SEARCH_ENTITY_TYPES.CATEGORY] ?? [],
          [SEARCH_ENTITY_TYPES.BRAND]: grouped[SEARCH_ENTITY_TYPES.BRAND] ?? [],
          [SEARCH_ENTITY_TYPES.HEALTH_CONCERN]: grouped[SEARCH_ENTITY_TYPES.HEALTH_CONCERN] ?? [],
        }
      : await this.recoverEmptyEntityHits(trimmed, entityLimit, config, {
          [SEARCH_ENTITY_TYPES.CATEGORY]: grouped[SEARCH_ENTITY_TYPES.CATEGORY] ?? [],
          [SEARCH_ENTITY_TYPES.BRAND]: grouped[SEARCH_ENTITY_TYPES.BRAND] ?? [],
          [SEARCH_ENTITY_TYPES.HEALTH_CONCERN]: grouped[SEARCH_ENTITY_TYPES.HEALTH_CONCERN] ?? [],
        });

    return this.mergeSearchResults(
      entities[SEARCH_ENTITY_TYPES.CATEGORY] ?? [],
      entities[SEARCH_ENTITY_TYPES.BRAND] ?? [],
      entities[SEARCH_ENTITY_TYPES.HEALTH_CONCERN] ?? [],
      sortBySearchRelevance(productHits, trimmed),
      perPage,
    );
  }

  /**
   * Published product name / variant display name in Postgres.
   * Used when Typesense has not indexed that title yet.
   */
  private async loadPublishedProductHits(
    trimmed: string,
    perPage: number,
    pincodeId: string | null,
  ): Promise<IPublicSearchResult[]> {
    const variants = await this.productsRepository.findPublishedDropdownSuggestions(
      trimmed,
      Math.min(perPage * 3, 30),
      pincodeId,
    );
    return filterDistinctMatchingProductVariants(
      variants
        .map((variant) => mapVariantToSearchResult(variant))
        .filter((result): result is IPublicSearchResult => Boolean(result)),
    );
  }

  /**
   * Runs only when the existing strict title filter kept nothing.
   * Order: typo hits already returned, compact query, higher typo budget, then
   * the longest word in the query ("cetaphil" from "cetaphil serum").
   * Unrelated catalog rows are not used.
   */
  private async recoverTolerantProductHits(
    trimmed: string,
    perPage: number,
    config: ITypesenseSearchRuntimeConfig,
    pincode: string | null,
    pincodeId: string | null,
    rawProducts: IPublicSearchResult[],
  ): Promise<IPublicSearchResult[]> {
    const tolerant = filterDistinctTolerantProductVariants(rawProducts, trimmed);
    if (isGibberishSearchQuery(trimmed)) {
      return tolerant.length
        ? this.retainProductsVisibleForPincode(tolerant, pincodeId)
        : [];
    }
    if (tolerant.length) {
      return this.retainProductsVisibleForPincode(tolerant, pincodeId);
    }

    const compact = compactSearchText(trimmed);
    if (searchQueryNeedsCompactRetry(trimmed)) {
      const compactHits = await this.searchProductDocuments(
        compact,
        perPage,
        config,
        pincode,
        TYPESENSE_FAST_SEARCH_PARAMS,
      );
      const matched = await this.retainProductsVisibleForPincode(
        filterDistinctMatchingProductVariants(compactHits, compact),
        pincodeId,
      );
      if (matched.length) return matched;
    }

    const budget = searchTypoBudget(compact.length);
    if (budget > TYPESENSE_FAST_SEARCH_PARAMS.num_typos) {
      const typoHits = await this.searchProductDocuments(trimmed, perPage, config, pincode, {
        ...TYPESENSE_FAST_SEARCH_PARAMS,
        num_typos: budget,
      });
      const matched = await this.retainProductsVisibleForPincode(
        filterDistinctTolerantProductVariants(typoHits, trimmed),
        pincodeId,
      );
      if (matched.length) return matched;
    }

    const fullCompact = compactSearchText(trimmed);
    for (const token of significantSearchTokens(trimmed)) {
      if (token === fullCompact) continue;
      const tokenHits = await this.searchProductDocuments(
        token,
        perPage,
        config,
        pincode,
        TYPESENSE_FAST_SEARCH_PARAMS,
      );
      const matched = await this.retainProductsVisibleForPincode(
        filterDistinctMatchingProductVariants(tokenHits, token),
        pincodeId,
      );
      if (matched.length) return matched;
    }

    return [];
  }

  private async recoverEmptyEntityHits(
    trimmed: string,
    entityLimit: number,
    config: ITypesenseSearchRuntimeConfig,
    current: Partial<Record<SearchEntityType, IPublicSearchResult[]>>,
  ): Promise<Partial<Record<SearchEntityType, IPublicSearchResult[]>>> {
    if (!config.hasEntityType || isGibberishSearchQuery(trimmed)) {
      return current;
    }

    const emptyTypes = (
      [SEARCH_ENTITY_TYPES.CATEGORY, SEARCH_ENTITY_TYPES.BRAND, SEARCH_ENTITY_TYPES.HEALTH_CONCERN] as const
    ).filter((entityType) => !(current[entityType]?.length));
    if (!emptyTypes.length) return current;

    const compact = compactSearchText(trimmed);
    const recovered = { ...current };
    if (searchQueryNeedsCompactRetry(trimmed)) {
      await this.fillEmptyEntityHits(
        recovered,
        emptyTypes,
        compact,
        entityLimit,
        config,
        TYPESENSE_FAST_SEARCH_PARAMS,
      );
    }

    const stillEmpty = emptyTypes.filter((entityType) => !(recovered[entityType]?.length));
    const budget = searchTypoBudget(compact.length);
    if (stillEmpty.length && budget > TYPESENSE_FAST_SEARCH_PARAMS.num_typos) {
      await this.fillEmptyEntityHits(recovered, stillEmpty, trimmed, entityLimit, config, {
        ...TYPESENSE_FAST_SEARCH_PARAMS,
        num_typos: budget,
      });
    }

    return recovered;
  }

  private async fillEmptyEntityHits(
    recovered: Partial<Record<SearchEntityType, IPublicSearchResult[]>>,
    entityTypes: SearchEntityType[],
    query: string,
    entityLimit: number,
    config: ITypesenseSearchRuntimeConfig,
    params: Record<string, unknown>,
  ): Promise<void> {
    if (!query) return;

    try {
      const collectionName = this.typesenseClient.getCollectionName();
      const searches = entityTypes.map((entityType) => ({
        collection: collectionName,
        q: query,
        query_by: this.entityQueryBy(config),
        per_page: entityLimit,
        ...params,
        ...(config.entityTypeFilters[entityType]
          ? { filter_by: config.entityTypeFilters[entityType] }
          : {}),
      }));
      const multiResult = (await this.typesenseClient
        .getSearchClient()
        .multiSearch.perform({ searches })) as MultiSearchResponse;
      entityTypes.forEach((entityType, index) => {
        const hits = mapTypesenseHitsToSearchResults(multiResult.results?.[index]?.hits ?? []);
        if (hits.length) recovered[entityType] = hits;
      });
    } catch (error) {
      this.logger.warn(
        { query, error: error instanceof Error ? error.message : String(error) },
        '[Search] Entity tolerance search failed',
      );
    }
  }

  private async searchProductDocuments(
    query: string,
    perPage: number,
    config: ITypesenseSearchRuntimeConfig,
    pincode: string | null,
    params: Record<string, unknown>,
  ): Promise<IPublicSearchResult[]> {
    if (!query) return [];

    const filterBy = this.applyProductPincodeFilter(
      config.entityTypeFilters[SEARCH_ENTITY_TYPES.PRODUCT],
      config,
      pincode,
    );

    try {
      const client = this.typesenseClient.getSearchClient() as {
        collections?: (name: string) => {
          documents: () => { search: (params: Record<string, unknown>) => Promise<{ hits?: unknown[] }> };
        };
      };
      if (typeof client.collections !== 'function') return [];

      const result = await client
        .collections(this.typesenseClient.getCollectionName())
        .documents()
        .search({
          q: query,
          query_by: this.productQueryBy(config, query !== '*'),
          per_page: Math.min(Math.max(perPage, 1) * 3, 30),
          ...params,
          ...(filterBy ? { filter_by: filterBy } : {}),
          ...(query !== '*' && config.hasInStock && !('sort_by' in params)
            ? { sort_by: 'inStock:desc,_text_match:desc' }
            : {}),
        });

      return mapTypesenseHitsToSearchResults(
        (result.hits ?? []) as Array<{ document?: Record<string, unknown> }>,
      );
    } catch (error) {
      this.logger.warn(
        { query, error: error instanceof Error ? error.message : String(error) },
        '[Search] Product tolerance search failed',
      );
      return [];
    }
  }

  /** Primary query_by is unchanged. nameCompact is added only on tolerance retries. */
  private productQueryBy(config: ITypesenseSearchRuntimeConfig, includeCompact: boolean): string {
    if (!includeCompact || !config.hasNameCompact) return config.productQueryBy;
    if (config.productQueryBy.split(',').includes('nameCompact')) return config.productQueryBy;
    return `${config.productQueryBy},nameCompact`;
  }

  private entityQueryBy(config: ITypesenseSearchRuntimeConfig): string {
    if (!config.hasNameCompact) return config.entityQueryBy;
    if (config.entityQueryBy.split(',').includes('nameCompact')) return config.entityQueryBy;
    return `${config.entityQueryBy},nameCompact`;
  }

  /**
   * Typesense can still return a variant the PDP would 404 (stale index, or the
   * pincode field is not on the collection yet). Keep a hit only when Postgres
   * still has an active variant for this pincode, and rebuild the link from that row.
   */
  private async retainProductsVisibleForPincode(
    hits: IPublicSearchResult[],
    pincodeId: string | null,
  ): Promise<IPublicSearchResult[]> {
    if (!hits.length) {
      return [];
    }

    const refIds = [...new Set(hits.map((hit) => hit.refId).filter(Boolean))];
    const published = await this.productsRepository.findPublishedByRefIds(refIds, pincodeId);
    const publishedByRefId = new Map(published.map((product) => [product.refId, product]));
    const visible: IPublicSearchResult[] = [];

    for (const hit of hits) {
      const product = publishedByRefId.get(hit.refId);
      if (!product?.variants?.length) {
        continue;
      }
      const variants = product.variants;

      const matched =
        variants.find(
          (variant) =>
            variant.slug === hit.slug ||
            (Boolean(hit.productPageUrl) && variant.productPageUrl === hit.productPageUrl),
        ) ??
        [...variants].sort(
          (left, right) =>
            (Number(left.sellingPrice) || 0) - (Number(right.sellingPrice) || 0),
        )[0];

      if (!matched) {
        continue;
      }

      matched.product = product;
      const mapped = mapVariantToSearchResult(matched);
      if (mapped) {
        visible.push(mapped);
      }
    }

    return visible;
  }

  private async searchWithNative(
    trimmed: string,
    perPage: number,
    pincodeId: string | null,
  ): Promise<IPublicSearchResult[]> {
    const entityLimit = Math.min(perPage, SEARCH_ENTITY_FETCH_LIMIT);
    const productLimit = Math.min(perPage * 3, 30);
    const pagination = { page: 1, limit: entityLimit, search: trimmed, sortBy: 'name', sortOrder: 'ASC' as const };

    const [categories, brands, healthConcerns, variants] = await Promise.all([
      this.categoriesRepository.findPublicPaginated(pagination),
      this.brandsRepository.findPublicPaginated(pagination),
      this.healthConcernsRepository.findPublicPaginated(pagination),
      this.productsRepository.findPublishedDropdownSuggestions(trimmed, productLimit, pincodeId),
    ]);

    const products = sortBySearchRelevance(
      filterDistinctMatchingProductVariants(
        variants
          .map((variant) => mapVariantToSearchResult(variant))
          .filter((result): result is IPublicSearchResult => Boolean(result)),
      ),
      trimmed,
    );

    return this.mergeSearchResults(
      categories.data
        .filter((category) => category.status === MasterStatus.ACTIVE)
        .map((category) => mapCategoryToSearchResult(category)),
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

  /**
   * Nested categories must link to `/product-category/l1/l2/...`, not leaf-only paths.
   * Resolve from DB so Typesense docs without `permalink` still work until reindex.
   */
  private async attachCategoryPermalinks(
    results: IPublicSearchResult[],
  ): Promise<IPublicSearchResult[]> {
    const categoryResults = results.filter(
      (result) => result.entityType === SEARCH_ENTITY_TYPES.CATEGORY,
    );
    if (!categoryResults.length) {
      return results;
    }

    const categories = await this.categoriesRepository.findActiveByRefIds(
      categoryResults.map((result) => result.refId),
    );
    if (!categories.length) {
      return results;
    }

    const permalinkByRefId = new Map<string, string>();
    await Promise.all(
      categories.map(async (category) => {
        const slugPath = await this.categoriesRepository.findSlugPathById(category.id);
        permalinkByRefId.set(
          category.refId,
          buildCategoryPermalink(slugPath.length ? slugPath : [category.slug]),
        );
      }),
    );

    return results.map((result) => {
      if (result.entityType !== SEARCH_ENTITY_TYPES.CATEGORY) {
        return result;
      }
      const permalink = permalinkByRefId.get(result.refId);
      return permalink ? { ...result, permalink } : result;
    });
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

  private mergeProductHits(
    primary: IPublicSearchResult[],
    extra: IPublicSearchResult[],
  ): IPublicSearchResult[] {
    const seen = new Set(primary.map((hit) => hit.refId));
    const merged = [...primary];
    for (const hit of extra) {
      if (!hit.refId || seen.has(hit.refId)) continue;
      seen.add(hit.refId);
      merged.push(hit);
    }
    return merged;
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

  private buildCacheKey(
    query: string,
    perPage: number,
    useTypesense: boolean,
    pincode: string | null,
  ): string {
    return `${useTypesense ? 'ts' : 'native'}\0${query.toLowerCase()}\0${perPage}\0${pincode ?? 'none'}`;
  }

  private typesensePincodeClause(
    config: ITypesenseSearchRuntimeConfig,
    pincode: string | null,
  ): string | undefined {
    if (!config.hasIsPincodeManaged) {
      return undefined;
    }
    if (!pincode) {
      return 'isPincodeManaged:=false';
    }
    return `(isPincodeManaged:=false || pincodes:=${pincode})`;
  }

  private applyProductPincodeFilter(
    filterBy: string | undefined,
    config: ITypesenseSearchRuntimeConfig,
    pincode: string | null,
  ): string | undefined {
    const clause = this.typesensePincodeClause(config, pincode);
    // Storefront search must not surface OOS when the collection has inStock.
    const inStock = config.hasInStock ? 'inStock:true' : undefined;
    const combined = [filterBy, clause, inStock].filter(Boolean).join(' && ');
    return combined || undefined;
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
