import { Injectable } from '@nestjs/common';
import { generateUniqueRefId } from '@packages/common';
import { SubscriptionBillingCycleEntity } from '../entities/subscription-billing-cycle.entity';
import { SubscriptionBillingCycleStatus } from '../enums/subscription-billing-cycle-status.enum';
import { SubscriptionBillingCyclesRepository } from '../repositories/subscription-billing-cycles.repository';
import { isBillingCyclePricingLocked } from '../utils/subscription-pricing-snapshot.util';

@Injectable()
export class SubscriptionBillingCycleService {
  constructor(private readonly cyclesRepository: SubscriptionBillingCyclesRepository) {}

  async getOrCreate(params: {
    subscriptionId: string;
    userId: string;
    billingCycleRef: string;
    sequence: number;
    chargeDate: Date;
    estimatedDeliveryDate: Date | null;
    amount: string;
    pricingSnapshot?: Record<string, unknown> | null;
    actor: string;
  }): Promise<SubscriptionBillingCycleEntity> {
    const existing = await this.cyclesRepository.findByBillingCycleRef(
      params.subscriptionId,
      params.billingCycleRef,
    );
    if (existing) {
      if (!isBillingCyclePricingLocked(existing.status) && params.pricingSnapshot) {
        await this.cyclesRepository.updateById(existing.id, {
          amount: params.amount,
          pricingSnapshot: params.pricingSnapshot,
          updatedBy: params.actor,
        });
        return (await this.cyclesRepository.findById(existing.id)) ?? existing;
      }
      return existing;
    }

    const refId = await generateUniqueRefId('cyc', (c) => this.cyclesRepository.existsByRefId(c));
    try {
      return await this.cyclesRepository.create({
        refId,
        subscriptionId: params.subscriptionId,
        userId: params.userId,
        billingCycleRef: params.billingCycleRef,
        sequence: params.sequence,
        status: SubscriptionBillingCycleStatus.SCHEDULED,
        chargeDate: params.chargeDate,
        estimatedDeliveryDate: params.estimatedDeliveryDate,
        amount: params.amount,
        currency: 'INR',
        pricingSnapshot: params.pricingSnapshot ?? null,
        createdBy: params.actor,
        updatedBy: params.actor,
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === '23505') {
        const raced = await this.cyclesRepository.findByBillingCycleRef(
          params.subscriptionId,
          params.billingCycleRef,
        );
        if (raced) return raced;
      }
      throw error;
    }
  }

  findBySubscriptionId(subscriptionId: string) {
    return this.cyclesRepository.findBySubscriptionId(subscriptionId);
  }

  latestOrderIdsBySubscription(subscriptionIds: string[]) {
    return this.cyclesRepository.findLatestOrderIdsBySubscriptionIds(subscriptionIds);
  }

  findById(id: string) {
    return this.cyclesRepository.findById(id);
  }

  findPaidOrderPending(asOfDate: Date) {
    return this.cyclesRepository.findPaidOrderPending(asOfDate);
  }

  updateById(id: string, data: Partial<SubscriptionBillingCycleEntity>) {
    return this.cyclesRepository.updateById(id, data);
  }

  claimStatus(
    id: string,
    from: SubscriptionBillingCycleStatus[],
    to: SubscriptionBillingCycleStatus,
    actor: string,
  ) {
    return this.cyclesRepository.claimStatus(id, from, to, actor);
  }

  claimDebitRetry(id: string, staleBefore: Date, actor: string) {
    return this.cyclesRepository.claimDebitRetry(id, staleBefore, actor);
  }
}
