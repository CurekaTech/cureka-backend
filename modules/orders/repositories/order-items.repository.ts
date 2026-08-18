import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { OrderItemEntity } from '../entities/order-item.entity';

@Injectable()
export class OrderItemsRepository {
  constructor(
    @InjectRepository(OrderItemEntity)
    private readonly repo: Repository<OrderItemEntity>,
  ) {}

  createMany(data: Partial<OrderItemEntity>[], manager?: EntityManager): Promise<OrderItemEntity[]> {
    const repository = manager ? manager.getRepository(OrderItemEntity) : this.repo;
    return repository.save(repository.create(data));
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
