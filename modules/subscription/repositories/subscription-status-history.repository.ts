import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { generateUniqueRefId } from '@packages/common';
import { EntityManager, Repository } from 'typeorm';
import { SubscriptionStatusHistoryEntity } from '../entities/subscription-status-history.entity';
import { SubscriptionHistoryAction } from '../enums/subscription-history-action.enum';

@Injectable()
export class SubscriptionStatusHistoryRepository {
  constructor(
    @InjectRepository(SubscriptionStatusHistoryEntity)
    private readonly repo: Repository<SubscriptionStatusHistoryEntity>,
  ) {}

  async append(
    data: {
      subscriptionId: string;
      action: SubscriptionHistoryAction;
      performedBy: string;
      fromStatus?: string | null;
      toStatus?: string | null;
      reason?: string | null;
      details?: Record<string, unknown> | null;
    },
    manager?: EntityManager,
  ): Promise<SubscriptionStatusHistoryEntity> {
    const repository = manager
      ? manager.getRepository(SubscriptionStatusHistoryEntity)
      : this.repo;
    const refId = await generateUniqueRefId('hst', (c) =>
      repository.exists({ where: { refId: c } }),
    );
    return repository.save(
      repository.create({
        refId,
        subscriptionId: data.subscriptionId,
        action: data.action,
        performedBy: data.performedBy,
        fromStatus: data.fromStatus ?? null,
        toStatus: data.toStatus ?? null,
        reason: data.reason ?? null,
        details: data.details ?? null,
        createdBy: data.performedBy,
        updatedBy: data.performedBy,
      }),
    );
  }

  findBySubscriptionId(subscriptionId: string): Promise<SubscriptionStatusHistoryEntity[]> {
    return this.repo.find({
      where: { subscriptionId },
      order: { createdAt: 'DESC' },
    });
  }
}
