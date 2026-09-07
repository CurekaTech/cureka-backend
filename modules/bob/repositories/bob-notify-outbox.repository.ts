import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import {
  BobNotifyOutboxEntity,
  BobNotifyOutboxStatus,
} from '../entities/bob-notify-outbox.entity';

const CLAIMABLE: BobNotifyOutboxStatus[] = ['pending', 'failed'];
const BLOCKING: BobNotifyOutboxStatus[] = [
  'accepted',
  'suppressed',
  'ambiguous',
  'sending',
];

@Injectable()
export class BobNotifyOutboxRepository {
  constructor(
    @InjectRepository(BobNotifyOutboxEntity)
    private readonly repo: Repository<BobNotifyOutboxEntity>,
  ) {}

  findByIdempotencyKey(
    key: string,
    manager?: EntityManager,
  ): Promise<BobNotifyOutboxEntity | null> {
    const repository = manager ? manager.getRepository(BobNotifyOutboxEntity) : this.repo;
    return repository.findOne({ where: { idempotencyKey: key } });
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }

  findAcceptedForOrderKind(
    orderId: string,
    notificationKind: string,
    manager?: EntityManager,
  ): Promise<BobNotifyOutboxEntity | null> {
    const repository = manager ? manager.getRepository(BobNotifyOutboxEntity) : this.repo;
    return repository.findOne({
      where: { orderId, notificationKind, status: 'accepted' },
      order: { createdAt: 'DESC' },
    });
  }

  findBlockingForOrderKind(
    orderId: string,
    notificationKind: string,
  ): Promise<BobNotifyOutboxEntity | null> {
    return this.repo.findOne({
      where: {
        orderId,
        notificationKind,
        status: In(BLOCKING),
      },
      order: { createdAt: 'DESC' },
    });
  }

  create(
    data: Partial<BobNotifyOutboxEntity>,
    manager?: EntityManager,
  ): Promise<BobNotifyOutboxEntity> {
    const repository = manager ? manager.getRepository(BobNotifyOutboxEntity) : this.repo;
    return repository.save(repository.create(data));
  }

  save(entity: BobNotifyOutboxEntity, manager?: EntityManager): Promise<BobNotifyOutboxEntity> {
    const repository = manager ? manager.getRepository(BobNotifyOutboxEntity) : this.repo;
    return repository.save(entity);
  }

  /**
   * Atomically claim a row for sending across PM2 workers.
   * Only pending/failed (or expired sending leases) can be claimed.
   */
  async claimForSend(
    id: string,
    claimToken: string,
    lockStaleBefore: Date,
  ): Promise<BobNotifyOutboxEntity | null> {
    const result = await this.repo
      .createQueryBuilder()
      .update(BobNotifyOutboxEntity)
      .set({
        status: 'sending',
        lockedAt: () => 'NOW()',
        claimToken,
        updatedBy: 'bob-fulfillment-outbox',
      })
      .where('id = :id', { id })
      .andWhere(
        `(status IN (:...claimable) OR (status = 'sending' AND (locked_at IS NULL OR locked_at < :stale)))`,
        { claimable: CLAIMABLE, stale: lockStaleBefore },
      )
      .execute();

    if (!result.affected) {
      return null;
    }

    return this.repo.findOne({ where: { id, claimToken } });
  }

  async updateStatus(
    id: string,
    data: {
      status: BobNotifyOutboxStatus;
      attempts?: number;
      lastHttpStatus?: number | null;
      lastError?: string | null;
      acceptedAt?: Date | null;
      lockedAt?: Date | null;
      claimToken?: string | null;
    },
  ): Promise<void> {
    await this.repo.update({ id }, { ...data, updatedBy: 'bob-notify-outbox' });
  }

  async updateStatusForClaim(
    id: string,
    claimToken: string,
    data: {
      status: BobNotifyOutboxStatus;
      attempts?: number;
      lastHttpStatus?: number | null;
      lastError?: string | null;
      acceptedAt?: Date | null;
    },
  ): Promise<boolean> {
    const result = await this.repo.update(
      { id, claimToken },
      {
        ...data,
        lockedAt: null,
        claimToken: null,
        updatedBy: 'bob-notify-outbox',
      },
    );
    return (result.affected ?? 0) > 0;
  }
}
