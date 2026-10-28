import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { generateUniqueRefId } from '@packages/common';
import { Repository } from 'typeorm';
import { SubscriptionReminderLogEntity } from '../entities/subscription-reminder-log.entity';

@Injectable()
export class SubscriptionReminderLogsRepository {
  constructor(
    @InjectRepository(SubscriptionReminderLogEntity)
    private readonly repo: Repository<SubscriptionReminderLogEntity>,
  ) {}

  findSent(params: {
    subscriptionId: string;
    billingCycleRef: string;
    daysBefore: number;
    channel?: string;
  }): Promise<SubscriptionReminderLogEntity | null> {
    return this.repo.findOne({
      where: {
        subscriptionId: params.subscriptionId,
        billingCycleRef: params.billingCycleRef,
        daysBefore: params.daysBefore,
        channel: params.channel ?? 'email',
      },
    });
  }

  /**
   * Insert-once. Returns true when this caller owns the send; false when a
   * concurrent worker already recorded the reminder (unique violation).
   */
  async tryRecordSend(params: {
    subscriptionId: string;
    billingCycleRef: string;
    daysBefore: number;
    channel?: string;
    paymentId?: string | null;
    actor?: string;
  }): Promise<boolean> {
    const channel = params.channel ?? 'email';
    const existing = await this.findSent({
      subscriptionId: params.subscriptionId,
      billingCycleRef: params.billingCycleRef,
      daysBefore: params.daysBefore,
      channel,
    });
    if (existing) return false;
    const refId = await generateUniqueRefId('srl', (c) =>
      this.repo.exists({ where: { refId: c } }),
    );
    try {
      await this.repo.save(
        this.repo.create({
          refId,
          subscriptionId: params.subscriptionId,
          billingCycleRef: params.billingCycleRef,
          daysBefore: params.daysBefore,
          channel,
          paymentId: params.paymentId ?? null,
          sentAt: new Date(),
          createdBy: params.actor ?? 'scheduler',
          updatedBy: params.actor ?? 'scheduler',
        }),
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/unique|duplicate/i.test(message)) return false;
      throw error;
    }
  }

  findBySubscriptionId(subscriptionId: string): Promise<SubscriptionReminderLogEntity[]> {
    return this.repo.find({
      where: { subscriptionId },
      order: { sentAt: 'DESC' },
    });
  }
}
