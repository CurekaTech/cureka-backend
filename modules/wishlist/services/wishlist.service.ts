import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { buildPaginatedResult, buildPaginationOptions, generateUniqueRefId } from '@packages/common';
import { CacheKeys, CacheModuleName, CacheStrategyService } from '@packages/cache';
import { IPublicProductCard } from '@modules/public/interfaces/public-product.interface';
import { ProductsService } from '@modules/product/services/products.service';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { AddWishlistItemDto } from '../dto/wishlist.dto';
import {
  IWishlistIdsResponse,
  IWishlistResponse,
} from '../interfaces/wishlist.interface';
import {
  enrichWishlistCards,
  mapPublishedProductsToWishlistCards,
  orderWishlistCardsByProductIds,
} from '../mappers/wishlist-product.mapper';
import { WishlistItemsRepository } from '../repositories/wishlist-items.repository';

const WISHLIST_IDS_CACHE_TTL_SECONDS = 60;
const WISHLIST_PAGE_CACHE_TTL_SECONDS = 45;

type CachedWishlistPage = Omit<IWishlistResponse, 'items'> & {
  items: IPublicProductCard[];
};

@Injectable()
export class WishlistService {
  private readonly logger = new Logger(WishlistService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly wishlistItemsRepository: WishlistItemsRepository,
    private readonly productsService: ProductsService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly cacheStrategy: CacheStrategyService,
  ) {}

  async findAll(userId: string, page = 1, limit = 20): Promise<IWishlistResponse> {
    const startedAt = Date.now();
    const pagination = buildPaginationOptions({ page, limit });

    const cachedPage = await this.cacheStrategy.cacheAside<CachedWishlistPage>({
      key: CacheKeys.wishlist.page(userId, pagination.page, pagination.limit),
      module: CacheModuleName.DEFAULT,
      ttlSeconds: WISHLIST_PAGE_CACHE_TTL_SECONDS,
      loader: async () => {
        const loaderStartedAt = Date.now();
        const [items, total] = await this.wishlistItemsRepository.findPaginatedByUserId(
          userId,
          pagination.page,
          pagination.limit,
        );
        const productIds = items.map((item) => item.productId);

        if (!productIds.length) {
          return {
            items: [],
            total,
            page: pagination.page,
            limit: pagination.limit,
            hasNextPage: false,
          };
        }

        const products = await this.productsService.findPublishedListByIds(productIds);
        const cards = mapPublishedProductsToWishlistCards(products);
        const orderedItems = orderWishlistCardsByProductIds(productIds, cards);
        const paginated = buildPaginatedResult(orderedItems, total, pagination);

        this.logger.log(
          `[PERF] wishlist.findAll.loader | user=${userId} page=${pagination.page} db+map=${Date.now() - loaderStartedAt}ms`,
        );

        return {
          items: paginated.data,
          total: paginated.total,
          page: paginated.page,
          limit: paginated.limit,
          hasNextPage: paginated.hasNextPage,
        };
      },
    });

    const enrichStartedAt = Date.now();
    const items = await enrichWishlistCards(cachedPage.items, this.storageUrlEnricher);

    this.logger.log(
      `[PERF] wishlist.findAll | user=${userId} page=${pagination.page} enrich=${Date.now() - enrichStartedAt}ms total=${Date.now() - startedAt}ms`,
    );

    return {
      ...cachedPage,
      items,
    };
  }

  async findProductIds(userId: string): Promise<IWishlistIdsResponse> {
    const startedAt = Date.now();

    const productIds = await this.cacheStrategy.cacheAside<string[]>({
      key: CacheKeys.wishlist.ids(userId),
      module: CacheModuleName.DEFAULT,
      ttlSeconds: WISHLIST_IDS_CACHE_TTL_SECONDS,
      loader: () => this.wishlistItemsRepository.findProductIdsByUserId(userId),
    });

    this.logger.log(
      `[PERF] wishlist.findProductIds | user=${userId} total=${Date.now() - startedAt}ms count=${productIds.length}`,
    );

    return { productIds };
  }

  async add(userId: string, dto: AddWishlistItemDto): Promise<IWishlistIdsResponse> {
    const startedAt = Date.now();

    const productIds = await this.dataSource.transaction(async (manager) => {
      const productExists = await this.productsService.existsPublishedById(dto.productId);
      if (!productExists) {
        throw new NotFoundException(`Product with id "${dto.productId}" not found`);
      }

      const existing = await this.wishlistItemsRepository.findByUserAndProduct(
        userId,
        dto.productId,
        manager,
      );

      if (!existing) {
        const refId = await generateUniqueRefId('wishlist', (candidate) =>
          this.wishlistItemsRepository.existsByRefId(candidate),
        );

        await this.wishlistItemsRepository.create(
          {
            refId,
            userId,
            productId: dto.productId,
            createdBy: userId,
            updatedBy: userId,
          },
          manager,
        );
      }

      return this.wishlistItemsRepository.findProductIdsByUserId(userId, manager);
    });

    await this.invalidateUserWishlistCache(userId);

    this.logger.log(
      `[PERF] wishlist.add | user=${userId} product=${dto.productId} total=${Date.now() - startedAt}ms`,
    );

    return { productIds };
  }

  async remove(userId: string, productId: string): Promise<IWishlistIdsResponse> {
    const startedAt = Date.now();

    const productIds = await this.dataSource.transaction(async (manager) => {
      const existing = await this.wishlistItemsRepository.findByUserAndProduct(
        userId,
        productId,
        manager,
      );

      if (!existing) {
        throw new NotFoundException(`Product with id "${productId}" is not in your wishlist`);
      }

      await this.wishlistItemsRepository.softDeleteByUserAndProduct(userId, productId, manager);

      return this.wishlistItemsRepository.findProductIdsByUserId(userId, manager);
    });

    await this.invalidateUserWishlistCache(userId);

    this.logger.log(
      `[PERF] wishlist.remove | user=${userId} product=${productId} total=${Date.now() - startedAt}ms`,
    );

    return { productIds };
  }

  private async invalidateUserWishlistCache(userId: string): Promise<void> {
    await this.cacheStrategy.invalidateOnly({
      keys: [CacheKeys.wishlist.ids(userId)],
      patterns: [CacheKeys.wishlist.pagePattern(userId)],
    });
  }
}
