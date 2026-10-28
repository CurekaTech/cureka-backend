import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { SubscriptionBillingCycleEntity } from '../entities/subscription-billing-cycle.entity';
import { SubscriptionBillingCycleStatus } from '../enums/subscription-billing-cycle-status.enum';

@Injectable()
export class SubscriptionBillingCyclesRepository {
  constructor(
    @InjectRepository(SubscriptionBillingCycleEntity)
    private readonly repo: Repository<SubscriptionBillingCycleEntity>,
  ) {}

  private use(manager?: EntityManager) {
    return manager ? manager.getRepository(SubscriptionBillingCycleEntity) : this.repo;
  }

  create(
    data: Partial<SubscriptionBillingCycleEntity>,
    manager?: EntityManager,
  ): Promise<SubscriptionBillingCycleEntity> {
    const repository = this.use(manager);
    return repository.save(repository.create(data));
  }

  findById(id: string, manager?: EntityManager): Promise<SubscriptionBillingCycleEntity | null> {
    return this.use(manager).findOne({ where: { id } });
  }

  findByBillingCycleRef(
    subscriptionId: string,
    billingCycleRef: string,
    manager?: EntityManager,
  ): Promise<SubscriptionBillingCycleEntity | null> {
    return this.use(manager).findOne({ where: { subscriptionId, billingCycleRef } });
  }

  async findLatestOrderIdsBySubscriptionIds(subscriptionIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(subscriptionIds.filter(Boolean))];
    if (!ids.length) return new Map();
    const rows = await this.repo
      .createQueryBuilder('cycle')
      .select(['cycle.subscriptionId', 'cycle.orderId', 'cycle.sequence'])
      .where('cycle.subscriptionId IN (:...ids)', { ids })
      .andWhere('cycle.orderId IS NOT NULL')
      .orderBy('cycle.sequence', 'DESC')
      .getMany();
    const orders = new Map<string, string>();
    for (const row of rows) {
      if (row.orderId && !orders.has(row.subscriptionId)) orders.set(row.subscriptionId, row.orderId);
    }
    return orders;
  }

  findBySubscriptionId(
    subscriptionId: string,
    manager?: EntityManager,
  ): Promise<SubscriptionBillingCycleEntity[]> {
    return this.use(manager).find({
      where: { subscriptionId },
      order: { sequence: 'DESC' },
    });
  }

  findPaidOrderPending(
    asOfDate: Date,
    manager?: EntityManager,
  ): Promise<SubscriptionBillingCycleEntity[]> {
    return this.use(manager)
      .createQueryBuilder('cycle')
      .where('cycle.status = :status', {
        status: SubscriptionBillingCycleStatus.PAID_ORDER_PENDING,
      })
      .andWhere('cycle.chargeDate <= :asOfDate', { asOfDate })
      .orderBy('cycle.chargeDate', 'ASC')
      .getMany();
  }

  async updateById(
    id: string,
    data: Partial<SubscriptionBillingCycleEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    await this.use(manager).update({ id }, data as never);
  }

  async markProcessingIfOpen(
    id: string,
    actor: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const result = await this.use(manager)
      .createQueryBuilder()
      .update(SubscriptionBillingCycleEntity)
      .set({
        processingStartedAt: new Date(),
        updatedBy: actor,
      })
      .where('id = :id', { id })
      .andWhere('status IN (:...open)', {
        open: [
          SubscriptionBillingCycleStatus.SCHEDULED,
          SubscriptionBillingCycleStatus.FAILED,
          SubscriptionBillingCycleStatus.LINK_GENERATED,
        ],
      })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async claimStatus(
    id: string,
    from: SubscriptionBillingCycleStatus[],
    to: SubscriptionBillingCycleStatus,
    actor: string,
  ): Promise<boolean> {
    if (!from.length) return false;
    const result = await this.repo
      .createQueryBuilder()
      .update(SubscriptionBillingCycleEntity)
      .set(
        to === SubscriptionBillingCycleStatus.DEBIT_PENDING
          ? { status: to, updatedBy: actor, processingStartedAt: new Date() }
          : { status: to, updatedBy: actor },
      )
      .where('id = :id', { id })
      .andWhere('status IN (:...from)', { from })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  /**
   * One worker may retry a debit only after the previous attempt is old enough
   * that a missing Razorpay payment is no longer an in-flight request.
   */
  async claimDebitRetry(id: string, staleBefore: Date, actor: string): Promise<boolean> {
    const result = await this.repo
      .createQueryBuilder()
      .update(SubscriptionBillingCycleEntity)
      .set({ processingStartedAt: new Date(), updatedBy: actor })
      .where('id = :id', { id })
      .andWhere('status = :status', { status: SubscriptionBillingCycleStatus.DEBIT_PENDING })
      .andWhere('(processing_started_at IS NULL OR processing_started_at <= :staleBefore)', { staleBefore })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }
}
