import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { generateUniqueRefId } from '@packages/common';
import { UsersRepository } from '@modules/users/repositories/users.repository';
import {
  AdminUserMembershipQueryDto,
  CancelMembershipDto,
  ChangeMembershipPlanDto,
  PurchaseMembershipDto,
} from '../dto/membership.dto';
import { SUBSCRIPTION_PAYMENT_PURPOSE } from '../constants/subscription-payment-purpose.constants';
import { MembershipPaymentStatus } from '../enums/membership-payment-status.enum';
import { MembershipPlanStatus } from '../enums/membership-plan-status.enum';
import { MembershipStatus } from '../enums/membership-status.enum';
import {
  mapMembershipPlanToResponse,
  mapUserMembershipToResponse,
} from '../mappers/membership.mapper';
import { checkoutExtrasFromLink } from '../utils/checkout-extras.util';
import { UserMembershipsRepository } from '../repositories/user-memberships.repository';
import { buildBillingCycleRef } from '../utils/billing-cycle-ref.util';
import { getNextMembershipBillingDate } from '../utils/next-billing-date.util';
import { buildSubscriptionGatewayNotes } from '../utils/subscription-gateway-notes.util';
import { MembershipPaymentsService } from './membership-payments.service';
import { MembershipPlansService } from './membership-plans.service';
import { MembershipPricingService } from './membership-pricing.service';
import { SubscriptionNotificationsService } from './subscription-notifications.service';
import { SubscriptionPaymentLinkService } from './subscription-payment-link.service';
import { SubscriptionRelationLoaderService } from './subscription-relation-loader.service';

@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);

  constructor(
    private readonly membershipsRepository: UserMembershipsRepository,
    private readonly plansService: MembershipPlansService,
    private readonly pricingService: MembershipPricingService,
    private readonly paymentsService: MembershipPaymentsService,
    private readonly paymentLinkService: SubscriptionPaymentLinkService,
    private readonly notificationsService: SubscriptionNotificationsService,
    private readonly usersRepository: UsersRepository,
    private readonly relationLoader: SubscriptionRelationLoaderService,
  ) {}

  listPlans() {
    return this.plansService.listActive();
  }

  getPlan(idOrRefId: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idOrRefId,
    );
    return isUuid ? this.plansService.findById(idOrRefId) : this.plansService.findByRefId(idOrRefId);
  }

  async purchase(userId: string, dto: PurchaseMembershipDto) {
    const plan = await this.resolvePlan(dto.planId, dto.planRefId);
    if (plan.status !== MembershipPlanStatus.ACTIVE) {
      throw new BadRequestException('Membership plan is not available');
    }

    const existingActive = await this.membershipsRepository.findActiveByUserId(userId);
    if (existingActive && existingActive.status === MembershipStatus.ACTIVE) {
      throw new BadRequestException(
        'You already have an active membership. Use change-plan to upgrade or downgrade.',
      );
    }

    const { amount } = this.pricingService.calculate(plan.price);
    const refId = await generateUniqueRefId('umem', (c) =>
      this.membershipsRepository.existsByRefId(c),
    );

    const membership = await this.membershipsRepository.create({
      refId,
      userId,
      membershipPlanId: plan.id,
      status: MembershipStatus.PENDING_PAYMENT,
      renewalMethod: plan.renewalMethod,
      termsAcceptedAt: dto.termsAccepted === false ? null : new Date(),
      createdBy: userId,
      updatedBy: userId,
    });

    const billingDate = new Date();
    const billingCycleRef = buildBillingCycleRef(billingDate);
    const payment = await this.paymentsService.upsertPendingCycle({
      userMembershipId: membership.id,
      userId,
      membershipPlanId: plan.id,
      billingCycleRef,
      amount,
      currency: plan.currency,
      billingDate,
      actor: userId,
    });

    const link = await this.createLinkForPayment({
      userId,
      paymentRefId: payment.refId,
      paymentId: payment.id,
      amount,
      currency: plan.currency,
      billingCycleRef,
      userMembershipId: membership.id,
      membershipPlanId: plan.id,
    });

    await this.paymentsService.attachPaymentLink(payment.id, {
      paymentLink: link.paymentLink ?? '',
      gatewayOrderId: link.gatewayOrderId,
      paymentGateway: link.paymentGateway,
      actor: userId,
    });
    await this.membershipsRepository.updateById(membership.id, {
      paymentGateway: link.paymentGateway,
      updatedBy: userId,
    });

    this.notificationsService.notifyPaymentLinkCreated({
      userId,
      kind: 'membership',
      paymentLink: link.paymentLink ?? '',
      amount,
      refId: membership.refId,
    });

    return mapUserMembershipToResponse(membership, {
      ...checkoutExtrasFromLink(link),
      plan: mapMembershipPlanToResponse(plan),
    });
  }

  async me(userId: string) {
    const membership = await this.membershipsRepository.findActiveByUserId(userId);
    if (!membership) return null;
    const [plan, users] = await Promise.all([
      this.plansService.findEntityById(membership.membershipPlanId),
      this.relationLoader.loadUsersByIds([userId]),
    ]);
    return mapUserMembershipToResponse(membership, {
      plan: plan ? mapMembershipPlanToResponse(plan) : null,
      user: users.get(userId) ?? null,
    });
  }

  async history(userId: string) {
    const rows = await this.membershipsRepository.findByUserId(userId);
    const users = await this.relationLoader.loadUsersByIds([userId]);
    const user = users.get(userId) ?? null;
    return Promise.all(
      rows.map(async (row) => {
        const plan = await this.plansService.findEntityById(row.membershipPlanId);
        return mapUserMembershipToResponse(row, {
          plan: plan ? mapMembershipPlanToResponse(plan) : null,
          user,
        });
      }),
    );
  }

  async cancel(userId: string, dto: CancelMembershipDto) {
    const membership = await this.membershipsRepository.findActiveByUserId(userId);
    if (!membership) throw new NotFoundException('No active membership found');

    await this.membershipsRepository.updateById(membership.id, {
      status: MembershipStatus.CANCELLED,
      cancellationDate: new Date(),
      cancellationReason: dto.reason ?? null,
      updatedBy: userId,
    });

    this.notificationsService.notifyCancelled({
      userId,
      kind: 'membership',
      refId: membership.refId,
    });

    return this.history(userId).then((rows) => rows.find((r) => r.id === membership.id));
  }

  async renew(userId: string) {
    const membership = await this.membershipsRepository.findActiveByUserId(userId);
    if (!membership) throw new NotFoundException('No membership found to renew');

    const plan = await this.plansService.findEntityById(membership.membershipPlanId);
    if (!plan || !plan.renewalEnabled) {
      throw new BadRequestException('Renewal is not enabled for this plan');
    }

    const billingDate = membership.nextBillingDate ?? new Date();
    const billingCycleRef = buildBillingCycleRef(billingDate);
    const { amount } = this.pricingService.calculate(plan.price);

    const payment = await this.paymentsService.upsertPendingCycle({
      userMembershipId: membership.id,
      userId,
      membershipPlanId: plan.id,
      billingCycleRef,
      amount,
      currency: plan.currency,
      billingDate,
      actor: userId,
    });

    if (payment.status === MembershipPaymentStatus.PAID) {
      return mapUserMembershipToResponse(membership, {
        plan: mapMembershipPlanToResponse(plan),
      });
    }

    const link = await this.createLinkForPayment({
      userId,
      paymentRefId: payment.refId,
      paymentId: payment.id,
      amount,
      currency: plan.currency,
      billingCycleRef,
      userMembershipId: membership.id,
      membershipPlanId: plan.id,
    });

    await this.paymentsService.attachPaymentLink(payment.id, {
      paymentLink: link.paymentLink ?? '',
      gatewayOrderId: link.gatewayOrderId,
      paymentGateway: link.paymentGateway,
      actor: userId,
    });
    await this.membershipsRepository.updateById(membership.id, {
      status: MembershipStatus.RENEWAL_PAYMENT_PENDING,
      updatedBy: userId,
    });

    this.notificationsService.notifyPaymentLinkCreated({
      userId,
      kind: 'membership',
      paymentLink: link.paymentLink ?? '',
      amount,
      refId: membership.refId,
    });

    return mapUserMembershipToResponse(membership, {
      ...checkoutExtrasFromLink(link),
      plan: mapMembershipPlanToResponse(plan),
    });
  }

  async changePlan(userId: string, dto: ChangeMembershipPlanDto) {
    const current = await this.membershipsRepository.findActiveByUserId(userId);
    if (!current) throw new NotFoundException('No active membership to change');

    const newPlan = await this.resolvePlan(dto.planId, dto.planRefId);
    if (newPlan.status !== MembershipPlanStatus.ACTIVE) {
      throw new BadRequestException('Target membership plan is not available');
    }
    if (newPlan.id === current.membershipPlanId) {
      throw new BadRequestException('Already on this membership plan');
    }

    const { amount } = this.pricingService.calculate(newPlan.price);
    const refId = await generateUniqueRefId('umem', (c) =>
      this.membershipsRepository.existsByRefId(c),
    );

    const membership = await this.membershipsRepository.create({
      refId,
      userId,
      membershipPlanId: newPlan.id,
      status: MembershipStatus.PENDING_PAYMENT,
      renewalMethod: newPlan.renewalMethod,
      termsAcceptedAt: new Date(),
      createdBy: userId,
      updatedBy: userId,
    });

    const billingDate = new Date();
    const billingCycleRef = buildBillingCycleRef(billingDate);
    const payment = await this.paymentsService.upsertPendingCycle({
      userMembershipId: membership.id,
      userId,
      membershipPlanId: newPlan.id,
      billingCycleRef,
      amount,
      currency: newPlan.currency,
      billingDate,
      actor: userId,
    });

    const link = await this.createLinkForPayment({
      userId,
      paymentRefId: payment.refId,
      paymentId: payment.id,
      amount,
      currency: newPlan.currency,
      billingCycleRef,
      userMembershipId: membership.id,
      membershipPlanId: newPlan.id,
    });

    await this.paymentsService.attachPaymentLink(payment.id, {
      paymentLink: link.paymentLink ?? '',
      gatewayOrderId: link.gatewayOrderId,
      paymentGateway: link.paymentGateway,
      actor: userId,
    });

    // Store previous membership id in payment metadata for activation swap
    // (handled in handlePaymentSuccess via metadata on payment if present)

    return mapUserMembershipToResponse(membership, {
      ...checkoutExtrasFromLink(link),
      plan: mapMembershipPlanToResponse(newPlan),
    });
  }

  async listPayments(userId: string) {
    return this.paymentsService.findByUserId(userId);
  }

  async listAdmin(query: AdminUserMembershipQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { data, total } = await this.membershipsRepository.findPaginated({
      page,
      limit,
      search: query.search,
      status: query.status,
      userId: query.userId,
    });
    const users = await this.relationLoader.loadUsersByIds(data.map((row) => row.userId));
    const items = await Promise.all(
      data.map(async (row) => {
        const plan = await this.plansService.findEntityById(row.membershipPlanId);
        return mapUserMembershipToResponse(row, {
          plan: plan ? mapMembershipPlanToResponse(plan) : null,
          user: users.get(row.userId) ?? null,
        });
      }),
    );
    return {
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  /**
   * Membership payment success — activates membership, NO order creation.
   */
  async handlePaymentSuccess(params: {
    paymentId?: string;
    gatewayOrderId?: string;
    gatewayPaymentId?: string;
    actor?: string;
  }): Promise<void> {
    const payment = params.paymentId
      ? await this.paymentsService.findById(params.paymentId)
      : params.gatewayOrderId
        ? await this.paymentsService.findByGatewayOrderId(params.gatewayOrderId)
        : null;

    if (!payment) {
      this.logger.warn(params, 'Membership payment not found for webhook');
      return;
    }

    const { payment: paidPayment, newlyPaid } = await this.paymentsService.markPaidIdempotent(
      payment.id,
      { gatewayPaymentId: params.gatewayPaymentId, actor: params.actor },
    );
    if (!newlyPaid) return;

    const membership = await this.membershipsRepository.findById(paidPayment.userMembershipId);
    if (!membership) {
      this.logger.error({ paymentId: paidPayment.id }, 'User membership missing after payment');
      return;
    }

    const plan = await this.plansService.findEntityById(paidPayment.membershipPlanId);
    if (!plan) {
      this.logger.error({ planId: paidPayment.membershipPlanId }, 'Plan missing after payment');
      return;
    }

    // End any other active memberships for this user (change-plan / one-active rule)
    const all = await this.membershipsRepository.findByUserId(membership.userId);
    for (const other of all) {
      if (
        other.id !== membership.id &&
        [
          MembershipStatus.ACTIVE,
          MembershipStatus.RENEWAL_PAYMENT_PENDING,
          MembershipStatus.PAST_DUE,
        ].includes(other.status)
      ) {
        await this.membershipsRepository.updateById(other.id, {
          status: MembershipStatus.CANCELLED,
          cancellationDate: new Date(),
          cancellationReason: 'Replaced by plan change',
          endDate: new Date(),
          updatedBy: params.actor ?? 'webhook',
        });
      }
    }

    const now = new Date();
    const endDate = new Date(now.getTime());
    endDate.setUTCDate(endDate.getUTCDate() + plan.validityDays);
    const nextBilling = getNextMembershipBillingDate(now, plan.billingCycle);

    await this.membershipsRepository.updateById(membership.id, {
      status: MembershipStatus.ACTIVE,
      startDate: membership.startDate ?? now,
      endDate,
      nextBillingDate: nextBilling,
      paymentGateway: paidPayment.paymentGateway,
      updatedBy: params.actor ?? 'webhook',
    });

    this.notificationsService.notifyActivated({
      userId: membership.userId,
      kind: 'membership',
      refId: membership.refId,
    });
  }

  async processRenewals(asOfDate = new Date()): Promise<number> {
    const due = await this.membershipsRepository.findDueForRenewal(
      [
        MembershipStatus.ACTIVE,
        MembershipStatus.RENEWAL_PAYMENT_PENDING,
        MembershipStatus.PAST_DUE,
      ],
      asOfDate,
    );

    let processed = 0;
    for (const membership of due) {
      try {
        const plan = await this.plansService.findEntityById(membership.membershipPlanId);
        if (!plan || !plan.renewalEnabled) continue;

        const billingDate = membership.nextBillingDate ?? asOfDate;
        const billingCycleRef = buildBillingCycleRef(billingDate);
        const { amount } = this.pricingService.calculate(plan.price);

        const payment = await this.paymentsService.upsertPendingCycle({
          userMembershipId: membership.id,
          userId: membership.userId,
          membershipPlanId: plan.id,
          billingCycleRef,
          amount,
          currency: plan.currency,
          billingDate,
          actor: 'scheduler',
        });

        if (payment.status === MembershipPaymentStatus.PAID) continue;
        if (payment.status === MembershipPaymentStatus.LINK_GENERATED && payment.paymentLink) {
          await this.membershipsRepository.updateById(membership.id, {
            status: MembershipStatus.RENEWAL_PAYMENT_PENDING,
            updatedBy: 'scheduler',
          });
          processed += 1;
          continue;
        }

        const link = await this.createLinkForPayment({
          userId: membership.userId,
          paymentRefId: payment.refId,
          paymentId: payment.id,
          amount,
          currency: plan.currency,
          billingCycleRef,
          userMembershipId: membership.id,
          membershipPlanId: plan.id,
        });

        await this.paymentsService.attachPaymentLink(payment.id, {
          paymentLink: link.paymentLink ?? '',
          gatewayOrderId: link.gatewayOrderId,
          paymentGateway: link.paymentGateway,
          actor: 'scheduler',
        });
        await this.membershipsRepository.updateById(membership.id, {
          status: MembershipStatus.RENEWAL_PAYMENT_PENDING,
          paymentGateway: link.paymentGateway,
          updatedBy: 'scheduler',
        });

        this.notificationsService.notifyRenewalDue({
          userId: membership.userId,
          kind: 'membership',
          paymentLink: link.paymentLink ?? '',
          amount,
          refId: membership.refId,
        });
        processed += 1;
      } catch (error) {
        this.logger.error(
          {
            membershipId: membership.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Membership renewal failed',
        );
      }
    }
    return processed;
  }

  async processReminders(asOfDate = new Date()): Promise<number> {
    const horizon = new Date(asOfDate.getTime() + 8 * 24 * 60 * 60 * 1000);
    const due = await this.membershipsRepository.findDueForRenewal(
      [MembershipStatus.ACTIVE, MembershipStatus.RENEWAL_PAYMENT_PENDING],
      horizon,
    );
    let sent = 0;
    for (const membership of due) {
      if (!membership.nextBillingDate) continue;
      const daysUntil = Math.round(
        (membership.nextBillingDate.getTime() - asOfDate.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (![7, 2, 0].includes(daysUntil)) continue;
      this.notificationsService.notifyReminder({
        userId: membership.userId,
        kind: 'membership',
        daysBefore: daysUntil,
        refId: membership.refId,
      });
      sent += 1;
    }
    return sent;
  }

  private async resolvePlan(planId?: string, planRefId?: string) {
    if (planId) {
      const plan = await this.plansService.findEntityById(planId);
      if (!plan) throw new NotFoundException('Membership plan not found');
      return plan;
    }
    if (planRefId) {
      const plan = await this.plansService.findEntityByRefId(planRefId);
      if (!plan) throw new NotFoundException('Membership plan not found');
      return plan;
    }
    throw new BadRequestException('planId or planRefId is required');
  }

  private async createLinkForPayment(params: {
    userId: string;
    paymentRefId: string;
    paymentId: string;
    amount: string;
    currency: string;
    billingCycleRef: string;
    userMembershipId: string;
    membershipPlanId: string;
  }) {
    const user = await this.usersRepository.findById(params.userId);
    return this.paymentLinkService.createPaymentLink({
      amount: params.amount,
      currency: params.currency,
      referenceId: params.paymentRefId,
      customer: {
        id: params.userId,
        name: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || undefined,
        email: user?.email,
        phone: user?.mobileNumber ?? '',
      },
      notes: buildSubscriptionGatewayNotes({
        paymentPurpose: SUBSCRIPTION_PAYMENT_PURPOSE.MEMBERSHIP,
        billingCycleRef: params.billingCycleRef,
        userMembershipId: params.userMembershipId,
        membershipPaymentId: params.paymentId,
        userId: params.userId,
        membershipPlanId: params.membershipPlanId,
      }),
      description: `Membership payment ${params.paymentRefId}`,
    });
  }
}
