import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionWebhookEventEntity } from '../entities/subscription-webhook-event.entity';

@Injectable()
export class SubscriptionWebhookEventsRepository {
  constructor(
    @InjectRepository(SubscriptionWebhookEventEntity)
    private readonly repo: Repository<SubscriptionWebhookEventEntity>,
  ) {}

  async tryRecord(params: {
    provider: string;
    eventId: string;
    eventType: string;
  }): Promise<boolean> {
    try {
      await this.repo.insert({
        provider: params.provider,
        eventId: params.eventId,
        eventType: params.eventType,
        processedAt: new Date(),
      });
      return true;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === '23505') return false;
      throw error;
    }
  }
}
