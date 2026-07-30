import { Injectable, NotFoundException } from '@nestjs/common';
import {
  buildPaginatedResult,
  buildPaginationOptions,
} from '@packages/common';
import {
  buildQueryCacheHash,
  CacheKeys,
  CacheModuleName,
  CacheStrategyService,
} from '@packages/cache';
import { ProductType } from '@modules/product/enums/product-type.enum';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { BrandsRepository } from '@modules/master/repositories/brands.repository';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { PublicBundleQueryDto } from '../dto/public-bundle-query.dto';
import {
  IPublicBundleCard,
  IPublicBundleDetail,
  IPublicBundleListResponse,
} from '../interfaces/public-bundle.interface';
import {
  mapProductEntitiesToPublicBundleCards,
  mapProductEntityToPublicBundleDetail,
} from '../mappers/public-bundle.mapper';

@Injectable()
export class PublicBundlesService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly brandsRepository: BrandsRepository,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
  ) {}

  async findAll(query: PublicBundleQueryDto): Promise<IPublicBundleListResponse> {
    const paginationOptions = buildPaginationOptions(query);
    const brandId = await this.resolveBrandId(query);
    const queryHash = buildQueryCacheHash({
      page: paginationOptions.page,
      limit: paginationOptions.limit,
      search: paginationOptions.search,
      sortBy: paginationOptions.sortBy,
      sortOrder: paginationOptions.sortOrder,
      brandRefId: query.brandRefId,
      brandSlug: query.brandSlug,
      brandId,
      productType: ProductType.BUNDLE,
    });

    const raw = await this.cacheStrategy.cacheAside({
      key: CacheKeys.publicBundles.list(queryHash),
      module: CacheModuleName.HOMEPAGE,
      loader: async () => {
        const { data, total } = await this.productsRepository.findPublishedPaginated({
          page: paginationOptions.page,
          limit: paginationOptions.limit,
          search: paginationOptions.search,
          sortBy: paginationOptions.sortBy,
          sortOrder: paginationOptions.sortOrder,
          productType: ProductType.BUNDLE,
          brandId,
        });
        return buildPaginatedResult(
          mapProductEntitiesToPublicBundleCards(data),
          total,
          paginationOptions,
        );
      },
    });

    return {
      ...raw,
      data: await Promise.all(raw.data.map((card) => this.enrichCard(card))),
    };
  }

  async findBySlug(slug: string): Promise<IPublicBundleDetail> {
    const key = slug.trim();
    if (!key) {
      throw new NotFoundException('Bundle slug is required');
    }

    const raw = await this.cacheStrategy.cacheAside({
      key: CacheKeys.publicBundles.detail(key),
      module: CacheModuleName.HOMEPAGE,
      loader: async () => {
        const entity = await this.productsRepository.findPublishedBySlug(key);
        if (!entity || entity.productType !== ProductType.BUNDLE) {
          throw new NotFoundException(`Bundle with slug "${key}" not found`);
        }
        return mapProductEntityToPublicBundleDetail(entity);
      },
    });

    return this.enrichDetail(raw);
  }

  private async resolveBrandId(query: PublicBundleQueryDto): Promise<string | undefined> {
    if (query.brandRefId) {
      const brand = await this.brandsRepository.findByRefId(query.brandRefId);
      if (!brand) {
        throw new NotFoundException(`Brand with refId "${query.brandRefId}" not found`);
      }
      return brand.id;
    }
    if (query.brandSlug) {
      const brand = await this.brandsRepository.findBySlug(query.brandSlug);
      if (!brand) {
        throw new NotFoundException(`Brand with slug "${query.brandSlug}" not found`);
      }
      return brand.id;
    }
    return undefined;
  }

  private async enrichCard(card: IPublicBundleCard): Promise<IPublicBundleCard> {
    const [bundleIcon, brand] = await Promise.all([
      this.storageUrlEnricher.toReference(card.bundleIcon),
      card.brand
        ? {
            ...card.brand,
            logo: await this.storageUrlEnricher.toReference(card.brand.logo),
          }
        : null,
    ]);

    return {
      ...card,
      bundleIcon,
      brand,
      pricing: {
        ...card.pricing,
        inStock: !card.outOfStock,
      },
    };
  }

  private async enrichDetail(detail: IPublicBundleDetail): Promise<IPublicBundleDetail> {
    const card = await this.enrichCard(detail);
    const media = await Promise.all(
      detail.media.map(async (item) => ({
        ...item,
        url: await this.storageUrlEnricher.toReference(item.url),
      })),
    );
    const wellnessGoals = await Promise.all(
      detail.wellnessGoals.map(async (goal) => ({
        ...goal,
        image: await this.storageUrlEnricher.toReference(goal.image),
      })),
    );

    return {
      ...detail,
      ...card,
      media,
      wellnessGoals,
    };
  }
}
