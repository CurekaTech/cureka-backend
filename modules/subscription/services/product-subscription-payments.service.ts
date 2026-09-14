import { Injectable, Logger } from '@nestjs/common';
import { generateUniqueRefId } from '@packages/common';
import { EntityManager } from 'typeorm';
import { SubscriptionPaymentEntity } from '../entities/subscription-payment.entity';
import { SubscriptionPaymentAttemptKind } from '../enums/subscription-payment-attempt-kind.enum';
import { SubscriptionPaymentStatus } from '../enums/subscription-payment-status.enum';
import { mapSubscriptionPaymentToResponse } from '../mappers/product-subscription.mapper';
import { ISubscriptionPayment } from '../interfaces/product-subscription.interface';
import { SubscriptionPaymentsRepository } from '../repositories/subscription-payments.repository';
import { UserProductSubscriptionsRepository } from '../repositories/user-product-subscriptions.repository';
import { AdminSubscriptionPaymentQueryDto } from '../dto/product-subscription.dto';
import { SubscriptionRelationLoaderService } from './subscription-relation-loader.service';

@Injectable()
export class ProductSubscriptionPaymentsService {
  private readonly logger = new Logger(ProductSubscriptionPaymentsService.name);

  constructor(
    private readonly paymentsRepository: SubscriptionPaymentsRepository,
    private readonly subscriptionsRepository: UserProductSubscriptionsRepository,
    private readonly relationLoader: SubscriptionRelationLoaderService,
  ) {}

  async upsertPendingCycle(params: {
    subscriptionId: string;
    userId: string;
    billingCycleRef: string;
    amount: string;
    currency?: string;
    billingDate: Date;
    actor: string;
    manager?: EntityManager;
  }): Promise<SubscriptionPaymentEntity> {
    const existing = await this.paymentsRepository.findByBillingCycle(
      params.subscriptionId,
      params.billingCycleRef,
      params.manager,
    );
    if (existing) {
      if (existing.status === SubscriptionPaymentStatus.PAID) {
        return existing;
      }
      await this.paymentsRepository.updateById(
        existing.id,
        {
          amount: params.amount,
          currency: params.currency ?? 'INR',
          billingDate: params.billingDate,
          updatedBy: params.actor,
        },
        params.manager,
      );
      const refreshed = await this.paymentsRepository.findById(existing.id, params.manager);
      return refreshed ?? existing;
    }

    const refId = await generateUniqueRefId('spay', (c) => this.paymentsRepository.existsByRefId(c));
    return this.paymentsRepository.create(
      {
        refId,
        subscriptionId: params.subscriptionId,
        userId: params.userId,
        billingCycleRef: params.billingCycleRef,
        amount: params.amount,
        currency: params.currency ?? 'INR',
        status: SubscriptionPaymentStatus.PENDING,
        billingDate: params.billingDate,
        createdBy: params.actor,
        updatedBy: params.actor,
      },
      params.manager,
    );
  }

  async attachPaymentLink(
    paymentId: string,
    data: {
      paymentLink: string | null;
      gatewayOrderId: string;
      paymentGateway: string;
      actor: string;
    },
  ): Promise<SubscriptionPaymentEntity> {
    await this.paymentsRepository.updateById(paymentId, {
      paymentLink: data.paymentLink,
      gatewayOrderId: data.gatewayOrderId,
      paymentGateway: data.paymentGateway,
      status: SubscriptionPaymentStatus.LINK_GENERATED,
      updatedBy: data.actor,
    });
    const updated = await this.paymentsRepository.findById(paymentId);
    if (!updated) throw new Error('Subscription payment missing after link attach');
    return updated;
  }

  async attachCycleMetadata(
    paymentId: string,
    data: {
      billingCycleId?: string | null;
      attemptKind?: SubscriptionPaymentAttemptKind;
      idempotencyKey?: string | null;
      actor: string;
    },
  ): Promise<void> {
    await this.paymentsRepository.updateById(paymentId, {
      billingCycleId: data.billingCycleId ?? undefined,
      attemptKind: data.attemptKind,
      idempotencyKey: data.idempotencyKey ?? undefined,
      updatedBy: data.actor,
    });
  }

  async markFailed(
    paymentId: string,
    reason: string,
    actor: string,
  ): Promise<void> {
    const existing = await this.paymentsRepository.findById(paymentId);
    if (!existing || existing.status === SubscriptionPaymentStatus.PAID) return;
    await this.paymentsRepository.updateById(paymentId, {
      status: SubscriptionPaymentStatus.FAILED,
      failureReason: reason,
      updatedBy: actor,
    });
  }

  async markReconciling(paymentId: string, actor: string): Promise<void> {
    const existing = await this.paymentsRepository.findById(paymentId);
    if (!existing || existing.status === SubscriptionPaymentStatus.PAID) return;
    await this.paymentsRepository.updateById(paymentId, {
      status: SubscriptionPaymentStatus.RECONCILING,
      updatedBy: actor,
    });
  }

  async markPaidIdempotent(
    paymentId: string,
    data: { gatewayPaymentId?: string; actor?: string },
  ): Promise<{ payment: SubscriptionPaymentEntity; newlyPaid: boolean }> {
    const existing = await this.paymentsRepository.findById(paymentId);
    if (!existing) {
      throw new Error(`Subscription payment ${paymentId} not found`);
    }
    if (existing.status === SubscriptionPaymentStatus.PAID) {
      this.logger.log({ paymentId }, 'Subscription payment already PAID — idempotent skip');
      return { payment: existing, newlyPaid: false };
    }

    const newlyPaid = await this.paymentsRepository.markPaidIfUnpaid(paymentId, {
      status: SubscriptionPaymentStatus.PAID,
      gatewayPaymentId: data.gatewayPaymentId ?? existing.gatewayPaymentId,
      paidAt: new Date(),
      updatedBy: data.actor ?? 'webhook',
    });

    const payment = (await this.paymentsRepository.findById(paymentId)) ?? existing;
    return { payment, newlyPaid };
  }

  findByGatewayOrderId(gatewayOrderId: string) {
    return this.paymentsRepository.findByGatewayOrderId(gatewayOrderId);
  }

  findById(id: string) {
    return this.paymentsRepository.findById(id);
  }

  async findBySubscriptionId(subscriptionId: string): Promise<ISubscriptionPayment[]> {
    const rows = await this.paymentsRepository.findBySubscriptionId(subscriptionId);
    const sub = await this.subscriptionsRepository.findById(subscriptionId);
    if (!sub) {
      return rows.map((row) => mapSubscriptionPaymentToResponse(row));
    }
    const [products, variants] = await Promise.all([
      this.relationLoader.loadProductsByIds([sub.productId]),
      this.relationLoader.loadVariantsByIds([sub.productVariantId]),
    ]);
    return rows.map((row) =>
      mapSubscriptionPaymentToResponse(row, {
        product: products.get(sub.productId) ?? null,
        variant: variants.get(sub.productVariantId) ?? null,
        subscription: {
          id: sub.id,
          refId: sub.refId,
          status: sub.status,
          frequency: sub.frequency,
          quantity: sub.quantity,
          finalAmount: sub.finalAmount,
        },
      }),
    );
  }

  async listAdmin(query: AdminSubscriptionPaymentQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { data, total } = await this.paymentsRepository.findPaginated({
      page,
      limit,
      search: query.search,
      status: query.status,
      subscriptionId: query.subscriptionId,
      userId: query.userId,
    });

    const subscriptionIds = [...new Set(data.map((row) => row.subscriptionId))];
    const subscriptions = await Promise.all(
      subscriptionIds.map(async (id) => {
        const sub = await this.subscriptionsRepository.findById(id);
        return [id, sub] as const;
      }),
    );
    const subscriptionMap = new Map(subscriptions.filter(([, sub]) => !!sub));

    const [users, products, variants] = await Promise.all([
      this.relationLoader.loadUsersByIds(data.map((row) => row.userId)),
      this.relationLoader.loadProductsByIds(
        [...subscriptionMap.values()].map((sub) => sub!.productId),
      ),
      this.relationLoader.loadVariantsByIds(
        [...subscriptionMap.values()].map((sub) => sub!.productVariantId),
      ),
    ]);

    return {
      items: data.map((row) => {
        const sub = subscriptionMap.get(row.subscriptionId) ?? null;
        return mapSubscriptionPaymentToResponse(row, {
          user: users.get(row.userId) ?? null,
          product: sub ? products.get(sub.productId) ?? null : null,
          variant: sub ? variants.get(sub.productVariantId) ?? null : null,
          subscription: sub
            ? {
                id: sub.id,
                refId: sub.refId,
                status: sub.status,
                frequency: sub.frequency,
                quantity: sub.quantity,
                finalAmount: sub.finalAmount,
              }
            : null,
        });
      }),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }
}
