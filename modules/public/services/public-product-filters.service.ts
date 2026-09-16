import { Injectable } from '@nestjs/common';
import {
  buildCursorPaginatedResult,
  buildCursorPaginationOptions,
  decodeCursor,
  encodeCursor,
} from '@packages/common';
import { buildQueryCacheHash, CacheKeys, CacheModuleName, CacheStrategyService } from '@packages/cache';
import { BrandEntity } from '@modules/master/entities/brand.entity';
import {
  ProductsRepository,
  PublicFacetBrandRow,
  PublicProductListOptions,
} from '@modules/product/repositories/products.repository';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { CategoryFiltersRepository } from '@modules/master/repositories/category-filters.repository';
import {
  CATEGORY_FILTER_ALL_VALUE,
  ensureCategoryFilterAllOption,
  hasCategoryFilterAllSentinel,
  isCategoryFilterAllSentinel,
} from '@modules/product/utils/category-filter-all.util';
import {
  LockedFacetKey,
  PublicListingContextType,
  PublicProductFacet,
} from '../enums/public-listing-context-type.enum';
import { PublicProductFiltersQueryDto } from '../dto/public-product-filters-query.dto';
import { resolvePublicPriceRange } from '../utils/price-range-query.util';
import {
  inferListingContextType,
  resolveFacetOmit,
  resolveLockedFacetKeys,
} from '../utils/product-listing-context.util';
import {
  buildFacetCategoryForest,
  flattenFacetCategoryTree,
  paginateFacetCategoryRoots,
} from '../utils/facet-category-tree.util';
import {
  IPublicFacetBrandItem,
  IPublicFacetCategoryNode,
  IPublicFacetCursorPage,
  IPublicFacetFilterGroup,
  IPublicProductFiltersResponse,
} from '../interfaces/public-product-filters.interface';
import { PublicProductsService } from './public-products.service';

const emptyCategoryPage = (limit: number): IPublicFacetCursorPage<IPublicFacetCategoryNode> => ({
  items: [],
  selectedItems: [],
  nextCursor: null,
  hasMore: false,
  limit,
});

const emptyBrandPage = (limit: number): IPublicFacetCursorPage<IPublicFacetBrandItem> => ({
  items: [],
  selectedItems: [],
  nextCursor: null,
  hasMore: false,
  limit,
});

@Injectable()
export class PublicProductFiltersService {
  constructor(
    private readonly publicProductsService: PublicProductsService,
    private readonly productsRepository: ProductsRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly categoryFiltersRepository: CategoryFiltersRepository,
    private readonly cacheStrategy: CacheStrategyService,
  ) {}

  async findFilters(query: PublicProductFiltersQueryDto): Promise<IPublicProductFiltersResponse> {
    const contextType = query.contextType ?? inferListingContextType(query);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    // Include query.facet so facet=brands|categories|… cannot poison the full sidebar cache.
    const queryHash = this.buildCacheHash(query, contextType, query.facet ?? 'all');

    return this.cacheStrategy.cacheAside({
      key: CacheKeys.publicProducts.filters(queryHash),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadFilters(query, contextType, limit),
    });
  }

  async findBrandFacets(
    query: PublicProductFiltersQueryDto,
  ): Promise<IPublicFacetCursorPage<IPublicFacetBrandItem>> {
    const contextType = query.contextType ?? inferListingContextType(query);
    const paging = buildCursorPaginationOptions({
      limit: query.limit,
      cursor: query.cursor,
      search: query.facetSearch,
    });
    const queryHash = this.buildCacheHash(query, contextType, 'brands');

    return this.cacheStrategy.cacheAside({
      key: CacheKeys.publicProducts.filterBrands(queryHash),
      module: CacheModuleName.HOMEPAGE,
      loader: async () => {
        const { listOptions, locked, selectedBrandIds, selectedBrands } =
          await this.resolveFacetBase(query, contextType);
        return this.loadBrands(
          listOptions,
          locked,
          paging.limit,
          paging.cursor,
          query.facetSearch,
          selectedBrandIds,
          selectedBrands,
        );
      },
    });
  }

  private async loadFilters(
    query: PublicProductFiltersQueryDto,
    contextType: PublicListingContextType,
    limit: number,
  ): Promise<IPublicProductFiltersResponse> {
    const { listOptions, locked, selectedBrandIds, selectedBrands, selectedCategoryId } =
      await this.resolveFacetBase(query, contextType);

    const facet = query.facet;
    const loadCategories = !facet || facet === PublicProductFacet.CATEGORIES;
    const loadBrands = !facet || facet === PublicProductFacet.BRANDS;
    const loadPrice = !facet || facet === PublicProductFacet.PRICE;
    const loadCategoryFilters = !facet || facet === PublicProductFacet.CATEGORY_FILTERS;

    const [categories, brands, priceRange, filters] = await Promise.all([
      loadCategories
        ? this.loadCategories(
            listOptions,
            locked,
            limit,
            facet === PublicProductFacet.CATEGORIES ? query.cursor : undefined,
            selectedCategoryId,
          )
        : Promise.resolve(emptyCategoryPage(limit)),
      loadBrands
        ? this.loadBrands(
            listOptions,
            locked,
            limit,
            facet === PublicProductFacet.BRANDS ? query.cursor : undefined,
            facet === PublicProductFacet.BRANDS ? query.facetSearch : undefined,
            selectedBrandIds,
            selectedBrands,
          )
        : Promise.resolve(emptyBrandPage(limit)),
      loadPrice
        ? this.productsRepository.findPublicFacetPriceRange(
            listOptions,
            resolveFacetOmit(PublicProductFacet.PRICE, locked),
          )
        : Promise.resolve({ min: null, max: null }),
      loadCategoryFilters
        ? this.loadCategoryFilters(listOptions, locked)
        : Promise.resolve([] as IPublicFacetFilterGroup[]),
    ]);

    return {
      contextType,
      categories,
      brands,
      priceRange,
      filters,
    };
  }

  private async resolveFacetBase(
    query: PublicProductFiltersQueryDto,
    contextType: PublicListingContextType,
  ) {
    const locked = resolveLockedFacetKeys({
      contextType,
      lockedFacets: query.lockedFacets,
      query,
    });
    const resolved = await this.publicProductsService.resolvePublishedListFilters(query);
    const priceRange = resolvePublicPriceRange(query);
    const selectedBrandIds = resolved.brandIds?.length
      ? resolved.brandIds
      : resolved.brandId
        ? [resolved.brandId]
        : [];
    const selectedBrands = resolved.selectedBrands ?? (resolved.brand ? [resolved.brand] : []);

    const listOptions: PublicProductListOptions = {
      page: 1,
      limit: 1,
      search: query.search,
      productType: query.productType,
      categoryId: resolved.categoryId,
      brandId: resolved.brandId,
      brandIds: resolved.brandIds,
      productNatureId: resolved.productNatureId,
      healthConcernId: resolved.healthConcernId,
      wellnessGoalId: resolved.wellnessGoalId,
      variantSlug: query.variantSlug,
      tagSlug: query.tagSlug,
      categoryFilterCriteria: resolved.categoryFilterCriteria,
      minPrice: priceRange?.minPrice,
      maxPrice: priceRange?.maxPrice,
    };

    return {
      locked,
      listOptions,
      selectedBrandIds,
      selectedBrands,
      selectedCategoryId: resolved.categoryId,
    };
  }

  private async loadBrands(
    listOptions: PublicProductListOptions,
    locked: Set<LockedFacetKey>,
    limit: number,
    cursor: string | undefined,
    facetSearch: string | undefined,
    selectedBrandIds: string[],
    selectedBrands: BrandEntity[],
  ): Promise<IPublicFacetCursorPage<IPublicFacetBrandItem>> {
    const omit = resolveFacetOmit(PublicProductFacet.BRANDS, locked);
    const selectedSet = new Set(selectedBrandIds);
    const rows = await this.productsRepository.findPublicFacetBrands(listOptions, omit, {
      limit,
      cursor,
      facetSearch,
    });
    const page = buildCursorPaginatedResult(rows, limit, (row: PublicFacetBrandRow) => row.name);
    const items: IPublicFacetBrandItem[] = page.data.map((row: PublicFacetBrandRow) => ({
      ...row,
      selected: selectedSet.has(row.id),
    }));
    const pageIds = new Set(items.map((item) => item.id));
    const missingIds = selectedBrandIds.filter((id) => !pageIds.has(id));
    const missingCounts = await this.productsRepository.findPublicFacetBrandsByIds(
      listOptions,
      omit,
      missingIds,
    );
    const countById = new Map(missingCounts.map((row) => [row.id, row.productCount]));
    const selectedItems: IPublicFacetBrandItem[] = selectedBrands
      .filter((brand) => missingIds.includes(brand.id))
      .map((brand) => ({
        id: brand.id,
        refId: brand.refId,
        name: brand.name,
        slug: brand.slug,
        productCount: countById.get(brand.id) ?? 0,
        selected: true,
      }));

    return {
      items,
      selectedItems,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      limit: page.limit,
    };
  }

  private async loadCategories(
    listOptions: PublicProductListOptions,
    locked: Set<LockedFacetKey>,
    limit: number,
    cursor: string | undefined,
    selectedCategoryId?: string,
  ): Promise<IPublicFacetCursorPage<IPublicFacetCategoryNode>> {
    const omit = resolveFacetOmit(PublicProductFacet.CATEGORIES, locked);
    const countRows = await this.productsRepository.findPublicFacetCategoryCounts(listOptions, omit);
    const counts = new Map(
      countRows.map((row) => [row.categoryId, Number(row.productCount) || 0]),
    );
    const matchingIds = [...counts.keys()].filter((id) => (counts.get(id) ?? 0) > 0);
    if (selectedCategoryId && !matchingIds.includes(selectedCategoryId)) {
      matchingIds.push(selectedCategoryId);
    }
    if (locked.has('category') && listOptions.categoryId && !matchingIds.includes(listOptions.categoryId)) {
      matchingIds.push(listOptions.categoryId);
    }

    const categories = await this.categoriesRepository.findActiveWithAncestorsByIds(matchingIds);
    const forest = buildFacetCategoryForest(
      categories.map((category) => ({
        id: category.id,
        refId: category.refId,
        name: category.name,
        slug: category.slug,
        position: category.position,
        hierarchyLevel: Number(category.hierarchyLevel),
        parentCategoryId: category.parentCategoryId,
      })),
      counts,
      {
        lockedCategoryId: locked.has('category') ? listOptions.categoryId : undefined,
        selectedIds: selectedCategoryId ? new Set([selectedCategoryId]) : undefined,
      },
    );

    const cursorId = cursor ? this.decodeCategoryCursor(cursor) : undefined;
    const paged = paginateFacetCategoryRoots(forest, limit, cursorId);
    const last = paged.items.at(-1);
    const nextCursor =
      paged.hasMore && last ? encodeCursor({ id: last.id, sortValue: last.name }) : null;

    const pageIds = new Set(flattenFacetCategoryTree(paged.items).map((node) => node.id));
    const selectedItems =
      selectedCategoryId && !pageIds.has(selectedCategoryId)
        ? flattenFacetCategoryTree(forest).filter((node) => node.id === selectedCategoryId)
        : [];

    return {
      items: paged.items,
      selectedItems,
      nextCursor,
      hasMore: paged.hasMore,
      limit,
    };
  }

  private async loadCategoryFilters(
    listOptions: PublicProductListOptions,
    locked: Set<LockedFacetKey>,
  ): Promise<IPublicFacetFilterGroup[]> {
    const selectedByFilterId = new Map(
      (listOptions.categoryFilterCriteria ?? []).map((criterion) => [
        criterion.categoryFilterId,
        new Set(criterion.values),
      ]),
    );

    const withoutCategoryFilters: PublicProductListOptions = {
      ...listOptions,
      categoryFilterCriteria: undefined,
    };
    const candidateIds = await this.productsRepository.findPublicFacetFilterIds(
      withoutCategoryFilters,
      [],
    );
    const selectedFilterIds = [...selectedByFilterId.keys()];
    const uniqueIds = [...new Set([...candidateIds, ...selectedFilterIds])];
    const masters = await this.categoryFiltersRepository.findActiveByIds(uniqueIds);
    if (!masters.length) return [];

    const groups = await Promise.all(
      masters.map(async (filter) => {
        const omit = resolveFacetOmit(`categoryFilter:${filter.id}`, locked);
        const values = await this.productsRepository.findPublicFacetFilterValues(
          listOptions,
          omit,
          filter.id,
        );
        const selectedValues = selectedByFilterId.get(filter.id) ?? new Set<string>();
        const allSelected = hasCategoryFilterAllSentinel([...selectedValues]);

        const concreteItems = values
          .filter((row) => !isCategoryFilterAllSentinel(row.value))
          .filter((row) => row.productCount > 0 || selectedValues.has(row.value))
          .map((row) => ({
            id: row.value,
            name: row.value,
            productCount: row.productCount,
            selected: !allSelected && selectedValues.has(row.value),
          }));

        for (const selected of selectedValues) {
          if (isCategoryFilterAllSentinel(selected)) continue;
          if (!concreteItems.some((item) => item.id === selected)) {
            concreteItems.push({
              id: selected,
              name: selected,
              productCount: 0,
              selected: !allSelected,
            });
          }
        }

        const displayValues = ensureCategoryFilterAllOption([
          ...concreteItems.map((item) => item.id),
          ...(allSelected ? [CATEGORY_FILTER_ALL_VALUE] : []),
        ]);

        const items =
          displayValues[0] === CATEGORY_FILTER_ALL_VALUE
            ? [
                {
                  id: CATEGORY_FILTER_ALL_VALUE,
                  name: CATEGORY_FILTER_ALL_VALUE,
                  productCount: await this.productsRepository.countPublicFacetFilterProducts(
                    listOptions,
                    omit,
                    filter.id,
                  ),
                  selected: allSelected,
                },
                ...concreteItems,
              ]
            : concreteItems;

        return {
          id: filter.refId,
          name: filter.name,
          type: 'checkbox' as const,
          items,
        };
      }),
    );

    return groups.filter((group) => group.items.length > 0);
  }

  private decodeCategoryCursor(cursor: string): string | undefined {
    try {
      return decodeCursor(cursor).id;
    } catch {
      return undefined;
    }
  }

  private buildCacheHash(
    query: PublicProductFiltersQueryDto,
    contextType: PublicListingContextType,
    facet: string,
  ): string {
    return buildQueryCacheHash({
      facet,
      contextType,
      lockedFacets: query.lockedFacets,
      categoryRefId: query.categoryRefId,
      categorySlug: query.categorySlug,
      brandRefId: query.brandRefId,
      brandSlug: query.brandSlug,
      search: query.search,
      healthConcernRefId: query.healthConcernRefId,
      healthConcernSlug: query.healthConcernSlug,
      wellnessGoalRefId: query.wellnessGoalRefId,
      productNatureRefId: query.productNatureRefId,
      productType: query.productType,
      variantSlug: query.variantSlug,
      tagSlug: query.tagSlug,
      categoryFilters: query.categoryFilters,
      categoryFilterRefId: query.categoryFilterRefId,
      categoryFilterValues: query.categoryFilterValues,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      priceRange: query.priceRange,
      facetSearch: query.facetSearch,
      cursor: query.cursor,
      limit: query.limit,
      inStockOnly: true,
    });
  }
}
