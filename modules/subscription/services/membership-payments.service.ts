import { Injectable, Logger } from '@nestjs/common';
import { generateUniqueRefId } from '@packages/common';
import { EntityManager } from 'typeorm';
import { AdminMembershipPaymentQueryDto } from '../dto/membership.dto';
import { MembershipPaymentEntity } from '../entities/membership-payment.entity';
import { MembershipPaymentStatus } from '../enums/membership-payment-status.enum';
import {
  mapMembershipPaymentToResponse,
  mapMembershipPlanToResponse,
} from '../mappers/membership.mapper';
import { MembershipPaymentsRepository } from '../repositories/membership-payments.repository';
import { MembershipPlansRepository } from '../repositories/membership-plans.repository';
import { UserMembershipsRepository } from '../repositories/user-memberships.repository';
import { SubscriptionRelationLoaderService } from './subscription-relation-loader.service';

@Injectable()
export class MembershipPaymentsService {
  private readonly logger = new Logger(MembershipPaymentsService.name);

  constructor(
    private readonly paymentsRepository: MembershipPaymentsRepository,
    private readonly membershipsRepository: UserMembershipsRepository,
    private readonly plansRepository: MembershipPlansRepository,
    private readonly relationLoader: SubscriptionRelationLoaderService,
  ) {}

  async upsertPendingCycle(params: {
    userMembershipId: string;
    userId: string;
    membershipPlanId: string;
    billingCycleRef: string;
    amount: string;
    currency?: string;
    billingDate: Date;
    actor: string;
    manager?: EntityManager;
  }): Promise<MembershipPaymentEntity> {
    const existing = await this.paymentsRepository.findByBillingCycle(
      params.userMembershipId,
      params.billingCycleRef,
      params.manager,
    );
    if (existing) {
      if (existing.status === MembershipPaymentStatus.PAID) return existing;
      await this.paymentsRepository.updateById(
        existing.id,
        {
          amount: params.amount,
          currency: params.currency ?? 'INR',
          billingDate: params.billingDate,
          membershipPlanId: params.membershipPlanId,
          updatedBy: params.actor,
        },
        params.manager,
      );
      return (await this.paymentsRepository.findById(existing.id, params.manager)) ?? existing;
    }

    const refId = await generateUniqueRefId('mpay', (c) => this.paymentsRepository.existsByRefId(c));
    return this.paymentsRepository.create(
      {
        refId,
        userMembershipId: params.userMembershipId,
        userId: params.userId,
        membershipPlanId: params.membershipPlanId,
        billingCycleRef: params.billingCycleRef,
        amount: params.amount,
        currency: params.currency ?? 'INR',
        status: MembershipPaymentStatus.PENDING,
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
  ): Promise<MembershipPaymentEntity> {
    await this.paymentsRepository.updateById(paymentId, {
      paymentLink: data.paymentLink,
      gatewayOrderId: data.gatewayOrderId,
      paymentGateway: data.paymentGateway,
      status: MembershipPaymentStatus.LINK_GENERATED,
      updatedBy: data.actor,
    });
    const updated = await this.paymentsRepository.findById(paymentId);
    if (!updated) throw new Error('Membership payment missing after link attach');
    return updated;
  }

  async markPaidIdempotent(
    paymentId: string,
    data: { gatewayPaymentId?: string; actor?: string },
  ): Promise<{ payment: MembershipPaymentEntity; newlyPaid: boolean }> {
    const existing = await this.paymentsRepository.findById(paymentId);
    if (!existing) throw new Error(`Membership payment ${paymentId} not found`);
    if (existing.status === MembershipPaymentStatus.PAID) {
      this.logger.log({ paymentId }, 'Membership payment already PAID — idempotent skip');
      return { payment: existing, newlyPaid: false };
    }

    const newlyPaid = await this.paymentsRepository.markPaidIfUnpaid(paymentId, {
      status: MembershipPaymentStatus.PAID,
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

  async findByUserId(userId: string) {
    const rows = await this.paymentsRepository.findByUserId(userId);
    const [users, plans] = await Promise.all([
      this.relationLoader.loadUsersByIds(rows.map((row) => row.userId)),
      Promise.all(
        [...new Set(rows.map((row) => row.membershipPlanId))].map(async (planId) => {
          const plan = await this.plansRepository.findById(planId);
          return [planId, plan ? mapMembershipPlanToResponse(plan) : null] as const;
        }),
      ),
    ]);
    const planMap = new Map(plans);
    return rows.map((row) =>
      mapMembershipPaymentToResponse(row, {
        user: users.get(row.userId) ?? null,
        plan: planMap.get(row.membershipPlanId) ?? null,
      }),
    );
  }

  async listAdmin(query: AdminMembershipPaymentQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { data, total } = await this.paymentsRepository.findPaginated({
      page,
      limit,
      search: query.search,
      status: query.status,
      userId: query.userId,
      userMembershipId: query.userMembershipId,
    });

    const [users, plans, memberships] = await Promise.all([
      this.relationLoader.loadUsersByIds(data.map((row) => row.userId)),
      Promise.all(
        [...new Set(data.map((row) => row.membershipPlanId))].map(async (planId) => {
          const plan = await this.plansRepository.findById(planId);
          return [planId, plan ? mapMembershipPlanToResponse(plan) : null] as const;
        }),
      ),
      Promise.all(
        [...new Set(data.map((row) => row.userMembershipId))].map(async (membershipId) => {
          const membership = await this.membershipsRepository.findById(membershipId);
          return [
            membershipId,
            membership
              ? {
                  id: membership.id,
                  refId: membership.refId,
                  status: membership.status,
                  startDate: membership.startDate?.toISOString() ?? null,
                  endDate: membership.endDate?.toISOString() ?? null,
                  nextBillingDate: membership.nextBillingDate?.toISOString() ?? null,
                }
              : null,
          ] as const;
        }),
      ),
    ]);

    const planMap = new Map(plans);
    const membershipMap = new Map(memberships);

    return {
      items: data.map((row) =>
        mapMembershipPaymentToResponse(row, {
          user: users.get(row.userId) ?? null,
          plan: planMap.get(row.membershipPlanId) ?? null,
          membership: membershipMap.get(row.userMembershipId) ?? null,
        }),
      ),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }
}
