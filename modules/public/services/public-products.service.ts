import { Injectable, NotFoundException } from '@nestjs/common';
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
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { PublicProductQueryDto } from '../dto/public-product-query.dto';
import {
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
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly brandsRepository: BrandsRepository,
    private readonly productNaturesRepository: ProductNaturesRepository,
    private readonly healthConcernsRepository: HealthConcernsRepository,
    private readonly wellnessGoalsRepository: WellnessGoalsRepository,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
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
      page: paginationOptions.page,
      limit: paginationOptions.limit,
      search: paginationOptions.search,
      sortBy: paginationOptions.sortBy,
      sortOrder: paginationOptions.sortOrder,
      productType: query.productType,
    });

    const result = await this.cacheStrategy.cacheAside({
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
        });
        return buildPaginatedResult(
          mapProductEntitiesToPublicCards(data),
          total,
          paginationOptions,
        );
      },
    });

    return this.enrichPaginatedCards(result);
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
      page: paginationOptions.page,
      limit: paginationOptions.limit,
      search: paginationOptions.search,
      sortBy: paginationOptions.sortBy,
      sortOrder: paginationOptions.sortOrder,
      productType: query.productType,
    });

    const result = await this.cacheStrategy.cacheAside({
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
        });
        return buildPaginatedResult(
          mapVariantEntitiesToPublicSearchItems(data),
          total,
          paginationOptions,
        );
      },
    });

    return this.enrichPaginatedVariantSearch(result);
  }

  async findBySlug(slug: string): Promise<IPublicProductDetail> {
    const product = await this.cacheStrategy.cacheAside({
      key: CacheKeys.publicProducts.detail(slug),
      module: CacheModuleName.HOMEPAGE,
      loader: async () => {
        const byProductSlug = await this.productsRepository.findPublishedBySlug(slug);
        if (byProductSlug) {
          const detail = mapProductEntityToPublicDetail(byProductSlug);
          const matchedVariant = detail.variants.find((variant) => variant.slug === slug);
          if (!matchedVariant) {
            return detail;
          }

          return {
            ...detail,
            selectedVariantId: matchedVariant.id,
            selectedVariantSlug: matchedVariant.slug,
          };
        }

        const byVariantSlug = await this.productsRepository.findPublishedByVariantSlug(slug);
        if (!byVariantSlug) {
          throw new NotFoundException(`Product with slug "${slug}" not found`);
        }

        const detail = mapProductEntityToPublicDetail(byVariantSlug);
        const matchedVariant = detail.variants.find((variant) => variant.slug === slug);

        return {
          ...detail,
          selectedVariantId: matchedVariant?.id ?? null,
          selectedVariantSlug: matchedVariant?.slug ?? slug,
        };
      },
    });

    return this.enrichDetail(product);
  }

  private async resolveListFilters(query: PublicProductQueryDto) {
    let categoryId: string | undefined;
    let brandId: string | undefined;
    let productNatureId: string | undefined;
    let healthConcernId: string | undefined;
    let wellnessGoalId: string | undefined;

    if (query.categoryRefId) {
      const category = await this.categoriesRepository.findByRefId(query.categoryRefId);
      categoryId = category?.id;
    } else if (query.categorySlug) {
      const category = await this.categoriesRepository.findBySlug(query.categorySlug);
      categoryId = category?.id;
    }
    if (query.brandRefId) {
      const brand = await this.brandsRepository.findByRefId(query.brandRefId);
      brandId = brand?.id;
    } else if (query.brandSlug) {
      const brand = await this.brandsRepository.findBySlug(query.brandSlug);
      brandId = brand?.id;
    }
    if (query.productNatureRefId) {
      const nature = await this.productNaturesRepository.findByRefId(query.productNatureRefId);
      productNatureId = nature?.id;
    }
    if (query.healthConcernRefId) {
      const healthConcern = await this.healthConcernsRepository.findByRefId(
        query.healthConcernRefId,
      );
      healthConcernId = healthConcern?.id;
    } else if (query.healthConcernSlug) {
      const healthConcern = await this.healthConcernsRepository.findBySlug(
        query.healthConcernSlug,
      );
      healthConcernId = healthConcern?.id;
    }
    if (query.wellnessGoalRefId) {
      const wellnessGoal = await this.wellnessGoalsRepository.findByRefId(query.wellnessGoalRefId);
      wellnessGoalId = wellnessGoal?.id;
    }

    return { categoryId, brandId, productNatureId, healthConcernId, wellnessGoalId };
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
    return {
      ...result,
      data: await Promise.all(result.data.map((card) => this.enrichCard(card))),
    };
  }

  private async enrichCard(card: IPublicProductCard): Promise<IPublicProductCard> {
    return {
      ...card,
      primaryImageUrl: await this.storageUrlEnricher.toReference(card.primaryImageUrl),
    };
  }

  private async enrichDetail(product: IPublicProductDetail): Promise<IPublicProductDetail> {
    const [media, wellnessGoals] = await Promise.all([
      this.storageUrlEnricher.enrichReferences(
        product.media,
        (item) => item.url,
        (item, url) => ({ ...item, url }),
      ),
      this.storageUrlEnricher.enrichReferences(
        product.wellnessGoals,
        (goal) => goal.image,
        (goal, image) => ({ ...goal, image }),
      ),
    ]);

    return { ...product, media, wellnessGoals };
  }
}
