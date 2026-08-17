import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { ProductSubscriptionFrequency } from '@modules/subscription/enums/product-subscription-frequency.enum';
import { CartItemEntity } from '../entities/cart-item.entity';

@Injectable()
export class CartItemsRepository {
  constructor(
    @InjectRepository(CartItemEntity)
    private readonly repo: Repository<CartItemEntity>,
  ) {}

  findByCartAndVariant(
    cartId: string,
    variantId: string,
    manager?: EntityManager,
    options?: {
      isSubscription?: boolean;
      frequency?: ProductSubscriptionFrequency | null;
    },
  ): Promise<CartItemEntity | null> {
    const repository = manager ? manager.getRepository(CartItemEntity) : this.repo;
    const isSubscription = options?.isSubscription ?? false;
    const frequency = options?.frequency ?? null;
    return repository.findOne({
      where: {
        cartId,
        variantId,
        isSubscription,
        frequency: frequency === null ? IsNull() : frequency,
      },
    });
  }

  create(data: Partial<CartItemEntity>, manager?: EntityManager): Promise<CartItemEntity> {
    const repository = manager ? manager.getRepository(CartItemEntity) : this.repo;
    return repository.save(repository.create(data));
  }

  updateById(id: string, data: Partial<CartItemEntity>, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(CartItemEntity) : this.repo;
    return repository.update({ id }, data).then(() => undefined);
  }

  deleteById(id: string, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(CartItemEntity) : this.repo;
    return repository.delete({ id }).then(() => undefined);
  }

  clearByCartId(cartId: string, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(CartItemEntity) : this.repo;
    return repository.delete({ cartId }).then(() => undefined);
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }
}
