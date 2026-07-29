import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { generateUniqueRefId } from '@packages/common';
import { EntityManager, Repository } from 'typeorm';
import { GokwikAbandonedCartEntity } from '../entities/gokwik-abandoned-cart.entity';
import { GokwikOrderEntity } from '../entities/gokwik-order.entity';
import { GokwikRefundEntity } from '../entities/gokwik-refund.entity';
import {
  GokwikSyncResourceType,
  GokwikSyncStateEntity,
  GokwikSyncStatus,
} from '../entities/gokwik-sync-state.entity';
import {
  GokwikWebhookEventEntity,
  GokwikWebhookProcessingStatus,
} from '../entities/gokwik-webhook-event.entity';

@Injectable()
export class GokwikRepository {
  constructor(
    @InjectRepository(GokwikOrderEntity)
    private readonly orderRepo: Repository<GokwikOrderEntity>,
    @InjectRepository(GokwikWebhookEventEntity)
    private readonly webhookRepo: Repository<GokwikWebhookEventEntity>,
    @InjectRepository(GokwikRefundEntity)
    private readonly refundRepo: Repository<GokwikRefundEntity>,
    @InjectRepository(GokwikAbandonedCartEntity)
    private readonly abandonedCartRepo: Repository<GokwikAbandonedCartEntity>,
    @InjectRepository(GokwikSyncStateEntity)
    private readonly syncStateRepo: Repository<GokwikSyncStateEntity>,
  ) {}

  findOrderByCartId(cartId: string, manager?: EntityManager): Promise<GokwikOrderEntity | null> {
    return this.repo(manager, GokwikOrderEntity, this.orderRepo).findOne({
      where: { cartId },
      relations: { order: true },
    });
  }

  findLatestOrderByCustomerPhone(customerPhone: string): Promise<GokwikOrderEntity | null> {
    return this.orderRepo.findOne({
      where: { customerPhone },
      relations: { order: true },
      order: { createdAt: 'DESC' },
    });
  }

  findOrderByOrderId(orderId: string): Promise<GokwikOrderEntity | null> {
    return this.orderRepo.findOne({
      where: { orderId },
      relations: { order: { items: { product: { media: true } } } },
    });
  }

  findOrderByGokwikOrderId(
    gokwikOrderId: string,
    manager?: EntityManager,
  ): Promise<GokwikOrderEntity | null> {
    return this.repo(manager, GokwikOrderEntity, this.orderRepo).findOne({
      where: { gokwikOrderId },
      relations: { order: true },
    });
  }

  findOrderByPaymentId(
    paymentId: string,
    manager?: EntityManager,
  ): Promise<GokwikOrderEntity | null> {
    return this.repo(manager, GokwikOrderEntity, this.orderRepo).findOne({
      where: { paymentId },
      relations: { order: true },
    });
  }

  async createOrderLink(
    data: Omit<Partial<GokwikOrderEntity>, 'refId'> & Pick<GokwikOrderEntity, 'orderId' | 'cartId'>,
    manager?: EntityManager,
  ): Promise<GokwikOrderEntity> {
    const repository = this.repo(manager, GokwikOrderEntity, this.orderRepo);
    const refId = await generateUniqueRefId('gokwik-order', (candidate) =>
      repository.exists({ where: { refId: candidate } }),
    );
    return repository.save(repository.create({ ...data, refId }));
  }

  async updateOrderLink(
    id: string,
    data: Partial<GokwikOrderEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.repo(manager, GokwikOrderEntity, this.orderRepo);
    const entity = await repository.findOneByOrFail({ id });
    await repository.save(repository.merge(entity, data));
  }

  findWebhookEvent(eventKey: string): Promise<GokwikWebhookEventEntity | null> {
    return this.webhookRepo.findOne({ where: { eventKey } });
  }

  findWebhookEventById(id: string): Promise<GokwikWebhookEventEntity | null> {
    return this.webhookRepo.findOne({ where: { id } });
  }

  async createWebhookEvent(
    data: Pick<
      GokwikWebhookEventEntity,
      'eventKey' | 'entity' | 'event' | 'providerReferenceId' | 'payload'
    >,
  ): Promise<GokwikWebhookEventEntity> {
    const refId = await generateUniqueRefId('gokwik-event', (candidate) =>
      this.webhookRepo.exists({ where: { refId: candidate } }),
    );
    return this.webhookRepo.save(
      this.webhookRepo.create({
        ...data,
        refId,
        status: 'received',
        processedAt: null,
        lastError: null,
      }),
    );
  }

  markWebhookEvent(
    id: string,
    status: GokwikWebhookProcessingStatus,
    lastError: string | null = null,
  ): Promise<void> {
    return this.webhookRepo
      .update(
        { id },
        {
          status,
          lastError,
          processedAt: status === 'processed' || status === 'ignored' ? new Date() : null,
        },
      )
      .then(() => undefined);
  }

  async upsertRefund(
    data: Pick<
      GokwikRefundEntity,
      | 'orderId'
      | 'refundId'
      | 'paymentId'
      | 'transactionPaymentId'
      | 'amount'
      | 'status'
      | 'auto'
      | 'description'
    >,
  ): Promise<GokwikRefundEntity> {
    const existing = await this.refundRepo.findOne({ where: { refundId: data.refundId } });
    if (existing) {
      await this.refundRepo.update({ id: existing.id }, data);
      return (await this.refundRepo.findOneByOrFail({ id: existing.id })) as GokwikRefundEntity;
    }
    const refId = await generateUniqueRefId('gokwik-refund', (candidate) =>
      this.refundRepo.exists({ where: { refId: candidate } }),
    );
    return this.refundRepo.save(this.refundRepo.create({ ...data, refId }));
  }

  findRefundByRefundId(refundId: string): Promise<GokwikRefundEntity | null> {
    return this.refundRepo.findOne({ where: { refundId } });
  }

  async sumSuccessfulOrPendingRefunds(
    orderId: string,
    excludingRefundId?: string,
  ): Promise<number> {
    const query = this.refundRepo
      .createQueryBuilder('refund')
      .select('COALESCE(SUM(refund.amount), 0)', 'total')
      .where('refund.orderId = :orderId', { orderId })
      .andWhere(
        `LOWER(refund.status) NOT LIKE :failed AND LOWER(refund.status) NOT LIKE :cancelled`,
        { failed: '%fail%', cancelled: '%cancel%' },
      );
    if (excludingRefundId) {
      query.andWhere('refund.refundId != :excludingRefundId', { excludingRefundId });
    }
    const result = await query.getRawOne<{ total: string }>();
    return Number(result?.total ?? 0);
  }

  async upsertAbandonedCart(
    data: Pick<
      GokwikAbandonedCartEntity,
      'externalCartId' | 'merchantCartId' | 'requestId' | 'payload' | 'receivedAt'
    >,
  ): Promise<void> {
    const existing = await this.abandonedCartRepo.findOne({
      where: { externalCartId: data.externalCartId },
    });
    if (existing) {
      await this.abandonedCartRepo.save(this.abandonedCartRepo.merge(existing, data));
      return;
    }
    const refId = await generateUniqueRefId('gokwik-cart', (candidate) =>
      this.abandonedCartRepo.exists({ where: { refId: candidate } }),
    );
    await this.abandonedCartRepo.save(this.abandonedCartRepo.create({ ...data, refId }));
  }

  async markSyncState(
    resourceType: GokwikSyncResourceType,
    resourceId: string,
    status: GokwikSyncStatus,
    options?: { remoteId?: string | null; lastError?: string | null },
  ): Promise<GokwikSyncStateEntity> {
    const existing = await this.syncStateRepo.findOne({ where: { resourceType, resourceId } });
    if (existing) {
      await this.syncStateRepo.update(
        { id: existing.id },
        {
          status,
          attempts: existing.attempts + 1,
          remoteId: options?.remoteId ?? existing.remoteId,
          lastError: options?.lastError ?? null,
          syncedAt: status === 'synced' ? new Date() : existing.syncedAt,
        },
      );
      return this.syncStateRepo.findOneByOrFail({ id: existing.id });
    }
    const refId = await generateUniqueRefId('gokwik-sync', (candidate) =>
      this.syncStateRepo.exists({ where: { refId: candidate } }),
    );
    return this.syncStateRepo.save(
      this.syncStateRepo.create({
        refId,
        resourceType,
        resourceId,
        status,
        attempts: 1,
        remoteId: options?.remoteId ?? null,
        lastError: options?.lastError ?? null,
        syncedAt: status === 'synced' ? new Date() : null,
      }),
    );
  }

  private repo<T extends object>(
    manager: EntityManager | undefined,
    entity: new () => T,
    fallback: Repository<T>,
  ): Repository<T> {
    return manager ? manager.getRepository(entity) : fallback;
  }
}
