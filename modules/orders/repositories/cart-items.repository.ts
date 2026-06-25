import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
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
  ): Promise<CartItemEntity | null> {
    const repository = manager ? manager.getRepository(CartItemEntity) : this.repo;
    return repository.findOne({ where: { cartId, variantId } });
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
