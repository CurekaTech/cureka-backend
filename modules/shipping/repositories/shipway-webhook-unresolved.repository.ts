import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  ShipwayWebhookUnresolvedEntity,
  ShipwayWebhookUnresolvedOutcome,
} from '../entities/shipway-webhook-unresolved.entity';

@Injectable()
export class ShipwayWebhookUnresolvedRepository {
  constructor(
    @InjectRepository(ShipwayWebhookUnresolvedEntity)
    private readonly repo: Repository<ShipwayWebhookUnresolvedEntity>,
  ) {}

  findByFingerprint(
    fingerprint: string,
    manager?: EntityManager,
  ): Promise<ShipwayWebhookUnresolvedEntity | null> {
    const repository = manager
      ? manager.getRepository(ShipwayWebhookUnresolvedEntity)
      : this.repo;
    return repository.findOne({ where: { payloadFingerprint: fingerprint } });
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }

  create(
    data: Partial<ShipwayWebhookUnresolvedEntity>,
    manager?: EntityManager,
  ): Promise<ShipwayWebhookUnresolvedEntity> {
    const repository = manager
      ? manager.getRepository(ShipwayWebhookUnresolvedEntity)
      : this.repo;
    return repository.save(repository.create(data));
  }

  save(
    entity: ShipwayWebhookUnresolvedEntity,
    manager?: EntityManager,
  ): Promise<ShipwayWebhookUnresolvedEntity> {
    const repository = manager
      ? manager.getRepository(ShipwayWebhookUnresolvedEntity)
      : this.repo;
    return repository.save(entity);
  }

  async markOutcome(
    id: string,
    data: {
      outcome: ShipwayWebhookUnresolvedOutcome;
      reason?: string | null;
      lastError?: string | null;
      resolvedShipmentId?: string | null;
      resolvedOrderId?: string | null;
      attempts?: number;
    },
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager
      ? manager.getRepository(ShipwayWebhookUnresolvedEntity)
      : this.repo;
    await repository.update({ id }, { ...data, updatedBy: 'shipway-reconcile' });
  }
}
