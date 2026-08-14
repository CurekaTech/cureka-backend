import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { buildSkipTake } from '@packages/database';
import { EntityManager, Not, Repository } from 'typeorm';
import { SubscriptionPaymentEntity } from '../entities/subscription-payment.entity';
import { SubscriptionPaymentStatus } from '../enums/subscription-payment-status.enum';

@Injectable()
export class SubscriptionPaymentsRepository {
  constructor(
    @InjectRepository(SubscriptionPaymentEntity)
    private readonly repo: Repository<SubscriptionPaymentEntity>,
  ) {}

  create(
    data: Partial<SubscriptionPaymentEntity>,
    manager?: EntityManager,
  ): Promise<SubscriptionPaymentEntity> {
    const repository = manager ? manager.getRepository(SubscriptionPaymentEntity) : this.repo;
    return repository.save(repository.create(data));
  }

  findById(id: string, manager?: EntityManager): Promise<SubscriptionPaymentEntity | null> {
    const repository = manager ? manager.getRepository(SubscriptionPaymentEntity) : this.repo;
    return repository.findOne({ where: { id } });
  }

  findByRefId(refId: string, manager?: EntityManager): Promise<SubscriptionPaymentEntity | null> {
    const repository = manager ? manager.getRepository(SubscriptionPaymentEntity) : this.repo;
    return repository.findOne({ where: { refId } });
  }

  findByBillingCycle(
    subscriptionId: string,
    billingCycleRef: string,
    manager?: EntityManager,
  ): Promise<SubscriptionPaymentEntity | null> {
    const repository = manager ? manager.getRepository(SubscriptionPaymentEntity) : this.repo;
    return repository.findOne({ where: { subscriptionId, billingCycleRef } });
  }

  findByGatewayOrderId(gatewayOrderId: string): Promise<SubscriptionPaymentEntity | null> {
    return this.repo.findOne({ where: { gatewayOrderId } });
  }

  findBySubscriptionId(subscriptionId: string): Promise<SubscriptionPaymentEntity[]> {
    return this.repo.find({
      where: { subscriptionId },
      order: { billingDate: 'DESC' },
    });
  }

  findByUserId(userId: string): Promise<SubscriptionPaymentEntity[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findPaginated(options: {
    page: number;
    limit: number;
    search?: string;
    status?: SubscriptionPaymentStatus;
    subscriptionId?: string;
    userId?: string;
  }): Promise<{ data: SubscriptionPaymentEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const qb = this.repo
      .createQueryBuilder('payment')
      .orderBy('payment.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (options.status) {
      qb.andWhere('payment.status = :status', { status: options.status });
    }
    if (options.subscriptionId) {
      qb.andWhere('payment.subscriptionId = :subscriptionId', {
        subscriptionId: options.subscriptionId,
      });
    }
    if (options.userId) {
      qb.andWhere('payment.userId = :userId', { userId: options.userId });
    }
    if (options.search) {
      qb.andWhere(
        `(payment.refId ILIKE :search OR payment.billingCycleRef ILIKE :search OR payment.gatewayOrderId ILIKE :search)`,
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async updateById(
    id: string,
    data: Partial<SubscriptionPaymentEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager ? manager.getRepository(SubscriptionPaymentEntity) : this.repo;
    await repository.update({ id }, data as any);
  }

  async markPaidIfUnpaid(
    id: string,
    data: Partial<SubscriptionPaymentEntity>,
  ): Promise<boolean> {
    const result = await this.repo.update(
      { id, status: Not(SubscriptionPaymentStatus.PAID) },
      data as any,
    );
    return (result.affected ?? 0) > 0;
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }
}
