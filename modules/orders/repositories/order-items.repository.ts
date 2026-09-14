import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { EntityManager, In, Repository } from 'typeorm';
import { OrderItemEntity } from '../entities/order-item.entity';
import { buildReturnPolicySnapshot } from '../utils/return-policy-snapshot.util';

@Injectable()
export class OrderItemsRepository {
  private readonly logger = new Logger(OrderItemsRepository.name);

  constructor(
    @InjectRepository(OrderItemEntity)
    private readonly repo: Repository<OrderItemEntity>,
  ) {}

  async createMany(
    data: Partial<OrderItemEntity>[],
    manager?: EntityManager,
  ): Promise<OrderItemEntity[]> {
    const repository = manager ? manager.getRepository(OrderItemEntity) : this.repo;
    const withPolicy = await this.attachReturnPolicySnapshots(data, manager);
    return repository.save(repository.create(withPolicy));
  }

  /**
   * Every order-creation path (website checkout, GoKwik, subscriptions, payment
   * requests, BOB) writes order items through `createMany`, so freezing the
   * policy here guarantees no path can silently skip the snapshot.
   *
   * Snapshot capture must never block order placement: if the catalogue lookup
   * fails the item is stored without a snapshot and resolved by the conservative
   * legacy fallback later.
   */
  private async attachReturnPolicySnapshots(
    data: Partial<OrderItemEntity>[],
    manager?: EntityManager,
  ): Promise<Partial<OrderItemEntity>[]> {
    const pending = data.filter(
      (item) => item.returnPolicySnapshot === undefined && Boolean(item.variantId),
    );
    if (pending.length === 0) {
      return data;
    }

    try {
      const variantRepo = manager
        ? manager.getRepository(ProductVariantEntity)
        : this.repo.manager.getRepository(ProductVariantEntity);

      const variantIds = [...new Set(pending.map((item) => item.variantId as string))];
      const variants = await variantRepo.find({
        where: { id: In(variantIds) },
        relations: { product: true },
      });
      const byId = new Map(variants.map((variant) => [variant.id, variant]));
      const capturedAt = new Date();

      return data.map((item) => {
        if (item.returnPolicySnapshot !== undefined || !item.variantId) {
          return item;
        }
        const variant = byId.get(item.variantId);
        if (!variant?.product) {
          return item;
        }
        return {
          ...item,
          returnPolicySnapshot: buildReturnPolicySnapshot(
            variant.product,
            variant,
            'SNAPSHOT',
            capturedAt,
          ),
        };
      });
    } catch (error) {
      this.logger.error(
        { err: error instanceof Error ? error.message : String(error) },
        'Failed to capture return policy snapshot for order items (non-blocking)',
      );
      return data;
    }
  }

  async updateById(
    id: string,
    data: Partial<OrderItemEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager ? manager.getRepository(OrderItemEntity) : this.repo;
    await repository.update({ id }, data as any);
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }
}
