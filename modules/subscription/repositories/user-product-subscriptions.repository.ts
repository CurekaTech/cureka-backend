import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { buildSkipTake } from '@packages/database';
import { EntityManager, In, LessThanOrEqual, Repository } from 'typeorm';
import { UserProductSubscriptionEntity } from '../entities/user-product-subscription.entity';
import { ProductSubscriptionStatus } from '../enums/product-subscription-status.enum';

@Injectable()
export class UserProductSubscriptionsRepository {
  constructor(
    @InjectRepository(UserProductSubscriptionEntity)
    private readonly repo: Repository<UserProductSubscriptionEntity>,
  ) {}

  create(
    data: Partial<UserProductSubscriptionEntity>,
    manager?: EntityManager,
  ): Promise<UserProductSubscriptionEntity> {
    const repository = manager ? manager.getRepository(UserProductSubscriptionEntity) : this.repo;
    return repository.save(repository.create(data));
  }

  findById(id: string, manager?: EntityManager): Promise<UserProductSubscriptionEntity | null> {
    const repository = manager ? manager.getRepository(UserProductSubscriptionEntity) : this.repo;
    return repository.findOne({ where: { id }, relations: { config: true } });
  }

  findByRefId(refId: string, manager?: EntityManager): Promise<UserProductSubscriptionEntity | null> {
    const repository = manager ? manager.getRepository(UserProductSubscriptionEntity) : this.repo;
    return repository.findOne({ where: { refId }, relations: { config: true } });
  }

  findByIdOrRefId(
    idOrRefId: string,
    manager?: EntityManager,
  ): Promise<UserProductSubscriptionEntity | null> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrRefId);
    return isUuid ? this.findById(idOrRefId, manager) : this.findByRefId(idOrRefId, manager);
  }

  findByIdAndUserId(
    id: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<UserProductSubscriptionEntity | null> {
    const repository = manager ? manager.getRepository(UserProductSubscriptionEntity) : this.repo;
    return repository.findOne({ where: { id, userId }, relations: { config: true } });
  }

  findByUserId(userId: string, manager?: EntityManager): Promise<UserProductSubscriptionEntity[]> {
    const repository = manager ? manager.getRepository(UserProductSubscriptionEntity) : this.repo;
    return repository.find({
      where: { userId },
      relations: { config: true },
      order: { createdAt: 'DESC' },
    });
  }

  findDueForRenewal(
    statuses: ProductSubscriptionStatus[],
    asOfDate: Date,
    manager?: EntityManager,
  ): Promise<UserProductSubscriptionEntity[]> {
    const repository = manager ? manager.getRepository(UserProductSubscriptionEntity) : this.repo;
    return repository.find({
      where: {
        status: In(statuses),
        nextBillingDate: LessThanOrEqual(asOfDate),
      },
      relations: { config: true },
      order: { nextBillingDate: 'ASC' },
    });
  }

  async findPaginated(options: {
    page: number;
    limit: number;
    search?: string;
    status?: ProductSubscriptionStatus;
    userId?: string;
  }): Promise<{ data: UserProductSubscriptionEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const qb = this.repo
      .createQueryBuilder('sub')
      .leftJoinAndSelect('sub.config', 'config')
      .orderBy('sub.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (options.status) {
      qb.andWhere('sub.status = :status', { status: options.status });
    }
    if (options.userId) {
      qb.andWhere('sub.userId = :userId', { userId: options.userId });
    }
    if (options.search) {
      qb.andWhere('(sub.refId ILIKE :search OR CAST(sub.id AS text) ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async updateById(
    id: string,
    data: Partial<UserProductSubscriptionEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager ? manager.getRepository(UserProductSubscriptionEntity) : this.repo;
    await repository.update({ id }, data);
  }

  async softDeleteById(id: string, _deletedBy?: string, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(UserProductSubscriptionEntity) : this.repo;
    await repository.softDelete(id);
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }
}
