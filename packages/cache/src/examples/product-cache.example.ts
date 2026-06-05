/**
 * Reference implementation for future products module.
 * Copy patterns into modules/products when the catalog module is introduced.
 */
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CacheKeys,
  CacheModuleName,
  CacheStrategyService,
  buildQueryCacheHash,
} from '@packages/cache';
import { ProductUpdatedEvent, EVENTS } from '@packages/events';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IProduct = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IProductListQuery = any;

@Injectable()
export class ProductCacheExampleService {
  constructor(
    private readonly cacheStrategy: CacheStrategyService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Cache-aside listing (heavy read path). */
  async findAll(query: IProductListQuery): Promise<IProduct[]> {
    const queryHash = buildQueryCacheHash({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      filters: query.filters ?? 'all',
    });

    return this.cacheStrategy.cacheAside({
      key: CacheKeys.products.list(query.page ?? 1, query.limit ?? 20, queryHash),
      module: CacheModuleName.PRODUCT,
      loader: async () => {
        // return this.productsRepository.findAllPaginated(query);
        return [];
      },
    });
  }

  /** Cache-aside product detail. */
  async findOne(refId: string): Promise<IProduct> {
    return this.cacheStrategy.cacheAside({
      key: CacheKeys.products.detail(refId),
      module: CacheModuleName.PRODUCT,
      loader: async () => {
        // return this.productsRepository.findByRefId(refId);
        return { refId };
      },
    });
  }

  /**
   * Write-through update flow:
   * PostgreSQL write -> emit event -> listener invalidates list keys
   * and this method refreshes detail cache immediately.
   */
  async updateProduct(refId: string, dto: Partial<IProduct>): Promise<IProduct> {
    return this.cacheStrategy.writeThrough({
      persist: async () => {
        // const updated = await this.productsRepository.updateByRefId(refId, dto);
        const updated = { refId, ...dto };
        await this.eventEmitter.emitAsync(
          EVENTS.PRODUCT_UPDATED,
          new ProductUpdatedEvent(refId, 'updated'),
        );
        return updated;
      },
      invalidatePatterns: [CacheKeys.products.listPattern(), CacheKeys.products.featuredPattern()],
      refreshEntries: [
        {
          key: CacheKeys.products.detail(refId),
          resolve: (product) => product,
          module: CacheModuleName.PRODUCT,
        },
      ],
    });
  }
}
