import { Injectable } from '@nestjs/common';
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
import { PublicWatchAndShopQueryDto } from '@modules/master/dto/watch-and-shop.dto';
import { WatchAndShopService } from '@modules/master/services/watch-and-shop.service';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { mapProductEntitiesToPublicStorefrontCards } from '../mappers/public-product.mapper';
import { PublicProductReviewStatsService } from './public-product-review-stats.service';
import { IPublicWatchAndShopItem } from '../interfaces/public-watch-and-shop.interface';

@Injectable()
export class PublicWatchAndShopService {
  constructor(
    private readonly watchAndShopService: WatchAndShopService,
    private readonly productsRepository: ProductsRepository,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly reviewStats: PublicProductReviewStatsService,
  ) {}

  findAll(
    query: PublicWatchAndShopQueryDto,
  ): Promise<PaginatedResult<IPublicWatchAndShopItem>> {
    const queryHash = buildQueryCacheHash({
      page: query.page,
      limit: query.limit,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return this.cacheStrategy.cacheAside({
      key: CacheKeys.watchAndShop.list(queryHash),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadAllUncached(query),
    }).then(async (result) => {
      const cards = result.data.map((item) => item.product);
      const withRatings = await this.reviewStats.attach(cards);
      return {
        ...result,
        data: result.data.map((item, index) => ({ ...item, product: withRatings[index]! })),
      };
    });
  }

  private async loadAllUncached(
    query: PublicWatchAndShopQueryDto,
  ): Promise<PaginatedResult<IPublicWatchAndShopItem>> {
    const paginated = await this.watchAndShopService.findActivePublicPaginated(query);
    const enriched = paginated.data;

    if (!enriched.length) {
      return buildPaginatedResult([], paginated.total, buildPaginationOptions(query));
    }

    const productRefIds = [...new Set(enriched.map((item) => item.productRefId))];
    const products = await this.productsRepository.findPublishedByRefIds(productRefIds);
    const productByRefId = new Map(products.map((product) => [product.refId, product]));

    const items = (
      await Promise.all(
        enriched.map(async (item) => {
          const product = productByRefId.get(item.productRefId);
          if (!product) return null;

          return {
            refId: item.refId,
            title: item.title,
            videoUrl: item.videoUrl,
            mediaUrl: item.mediaUrl as IPublicWatchAndShopItem['mediaUrl'],
            sortOrder: item.sortOrder,
            product: mapProductEntitiesToPublicStorefrontCards([product])[0]!,
          };
        }),
      )
    ).filter((item): item is IPublicWatchAndShopItem => item !== null);

    return buildPaginatedResult(items, paginated.total, buildPaginationOptions(query));
  }
}
