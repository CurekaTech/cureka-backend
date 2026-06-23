import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { buildSkipTake } from '@packages/database';
import { EntityManager, Repository } from 'typeorm';
import { OrderEntity } from '../entities/order.entity';
import { OrderStatus } from '../enums/order-status.enum';

@Injectable()
export class OrdersRepository {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly repo: Repository<OrderEntity>,
  ) {}

  create(data: Partial<OrderEntity>, manager?: EntityManager): Promise<OrderEntity> {
    const repository = manager ? manager.getRepository(OrderEntity) : this.repo;
    return repository.save(repository.create(data));
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }

  existsByOrderNumber(orderNumber: string): Promise<boolean> {
    return this.repo.exists({ where: { orderNumber } });
  }

  findByIdAndUserId(id: string, userId: string): Promise<OrderEntity | null> {
    return this.repo.findOne({
      where: { id, userId },
      relations: { items: true },
      order: { items: { createdAt: 'ASC' } },
    });
  }

  async findByUserPaginated(options: {
    userId: string;
    status?: OrderStatus;
    page: number;
    limit: number;
  }): Promise<{ data: OrderEntity[]; total: number }> {
    const { userId, status, page, limit } = options;
    const { skip, take } = buildSkipTake(page, limit);
    const qb = this.repo
      .createQueryBuilder('order')
      .where('order.userId = :userId', { userId })
      .orderBy('order.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (status) {
      qb.andWhere('order.orderStatus = :status', { status });
    }

    return qb.getManyAndCount().then(([data, total]) => ({ data, total }));
  }

  updateById(id: string, data: Partial<OrderEntity>, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(OrderEntity) : this.repo;
    return repository.update({ id }, data).then(() => undefined);
  }
}
