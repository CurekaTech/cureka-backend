import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { BobNotifyOutboxStatus } from '../entities/bob-notify-outbox.entity';
import { BobAbandonedCartOutboxEntity } from '../entities/bob-abandoned-cart-outbox.entity';
import { BOB_ABANDONED_CART_NOTIFY_KIND } from '../constants/bob-abandoned-cart.constants';

const CLAIMABLE: BobNotifyOutboxStatus[] = ['pending', 'failed'];

@Injectable()
export class BobAbandonedCartOutboxRepository {
  constructor(
    @InjectRepository(BobAbandonedCartOutboxEntity)
    private readonly repo: Repository<BobAbandonedCartOutboxEntity>,
  ) {}

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }

  findById(id: string): Promise<BobAbandonedCartOutboxEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByIdempotencyKey(key: string): Promise<BobAbandonedCartOutboxEntity | null> {
    return this.repo.findOne({ where: { idempotencyKey: key } });
  }

  findInFlightForUser(userId: string): Promise<BobAbandonedCartOutboxEntity | null> {
    return this.repo.findOne({
      where: {
        userId,
        notificationKind: BOB_ABANDONED_CART_NOTIFY_KIND,
        status: In(['pending', 'sending']),
      },
      order: { createdAt: 'DESC' },
    });
  }

  findInFlightForPhone(phoneNormalized: string): Promise<BobAbandonedCartOutboxEntity | null> {
    return this.repo.findOne({
      where: {
        destinationPhoneNormalized: phoneNormalized,
        notificationKind: BOB_ABANDONED_CART_NOTIFY_KIND,
        status: In(['pending', 'sending']),
      },
      order: { createdAt: 'DESC' },
    });
  }

  findLatestForUser(userId: string): Promise<BobAbandonedCartOutboxEntity | null> {
    return this.repo.findOne({
      where: { userId, notificationKind: BOB_ABANDONED_CART_NOTIFY_KIND },
      order: { createdAt: 'DESC' },
    });
  }

  async findBlockingByUserIds(userIds: string[]): Promise<BobAbandonedCartOutboxEntity[]> {
    if (!userIds.length) return [];
    return this.repo.find({
      where: {
        userId: In([...new Set(userIds)]),
        notificationKind: BOB_ABANDONED_CART_NOTIFY_KIND,
        status: In(['pending', 'sending', 'accepted', 'ambiguous', 'failed']),
      },
      order: { createdAt: 'DESC' },
    });
  }

  async findBlockingByPhones(phones: string[]): Promise<BobAbandonedCartOutboxEntity[]> {
    const unique = [...new Set(phones.filter(Boolean))];
    if (!unique.length) return [];
    return this.repo.find({
      where: {
        destinationPhoneNormalized: In(unique),
        notificationKind: BOB_ABANDONED_CART_NOTIFY_KIND,
        status: In(['pending', 'sending', 'accepted', 'ambiguous', 'failed']),
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Latest accepted or uncertain attempt in the rolling window for this user or phone.
   * Dedupes shared WhatsApp destinations across accounts.
   */
  async findCooldownAnchor(params: {
    userId: string;
    phoneNormalized: string;
    since: Date;
  }): Promise<BobAbandonedCartOutboxEntity | null> {
    return this.repo
      .createQueryBuilder('outbox')
      .where('outbox.notificationKind = :kind', { kind: BOB_ABANDONED_CART_NOTIFY_KIND })
      .andWhere('outbox.deletedAt IS NULL')
      .andWhere('outbox.status IN (:...statuses)', { statuses: ['accepted', 'ambiguous'] })
      .andWhere('(outbox.userId = :userId OR outbox.destinationPhoneNormalized = :phone)', {
        userId: params.userId,
        phone: params.phoneNormalized,
      })
      .andWhere('COALESCE(outbox.acceptedAt, outbox.createdAt) >= :since', { since: params.since })
      .orderBy('COALESCE(outbox.acceptedAt, outbox.createdAt)', 'DESC')
      .getOne();
  }

  create(
    data: Partial<BobAbandonedCartOutboxEntity>,
    manager?: EntityManager,
  ): Promise<BobAbandonedCartOutboxEntity> {
    const repository = manager ? manager.getRepository(BobAbandonedCartOutboxEntity) : this.repo;
    return repository.save(repository.create(data));
  }

  async claimForSend(
    id: string,
    claimToken: string,
    lockStaleBefore: Date,
  ): Promise<BobAbandonedCartOutboxEntity | null> {
    const result = await this.repo
      .createQueryBuilder()
      .update(BobAbandonedCartOutboxEntity)
      .set({
        status: 'sending',
        lockedAt: () => 'NOW()',
        claimToken,
        updatedBy: 'bob-abandoned-cart-outbox',
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
        updatedBy: 'bob-abandoned-cart-outbox',
      },
    );
    return (result.affected ?? 0) > 0;
  }

  async updateStatus(
    id: string,
    data: {
      status: BobNotifyOutboxStatus;
      attempts?: number;
      lastHttpStatus?: number | null;
      lastError?: string | null;
      acceptedAt?: Date | null;
      jobId?: string | null;
      lockedAt?: Date | null;
      claimToken?: string | null;
    },
  ): Promise<void> {
    await this.repo.update({ id }, { ...data, updatedBy: 'bob-abandoned-cart-outbox' });
  }
}
