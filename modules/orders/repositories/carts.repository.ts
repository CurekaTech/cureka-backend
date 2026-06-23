import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CartEntity } from '../entities/cart.entity';

@Injectable()
export class CartsRepository {
  constructor(
    @InjectRepository(CartEntity)
    private readonly repo: Repository<CartEntity>,
  ) {}

  findActiveByUserId(userId: string, manager?: EntityManager): Promise<CartEntity | null> {
    const repository = manager ? manager.getRepository(CartEntity) : this.repo;
    return repository.findOne({
      where: { userId, isActive: true },
      relations: {
        items: {
          product: true,
          variant: true,
        },
      },
      order: { items: { createdAt: 'ASC' } },
    });
  }

  create(data: Partial<CartEntity>, manager?: EntityManager): Promise<CartEntity> {
    const repository = manager ? manager.getRepository(CartEntity) : this.repo;
    return repository.save(repository.create(data));
  }

  updateById(id: string, data: Partial<CartEntity>, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(CartEntity) : this.repo;
    return repository.update({ id }, data).then(() => undefined);
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }
}
