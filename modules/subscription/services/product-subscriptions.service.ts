import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { generateUniqueRefId } from '@packages/common';
import { AuditService } from '@modules/master/services/audit.service';
import { AuditEntityType } from '@modules/master/constants/audit-entity-type.constant';
import { OrdersService } from '@modules/orders/services/orders.service';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderSource } from '@modules/orders/enums/order-source.enum';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { ProductVariantsRepository } from '@modules/product/repositories/product-variants.repository';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { UserAddressesRepository } from '@modules/users/repositories/user-addresses.repository';
import { UsersRepository } from '@modules/users/repositories/users.repository';
import {
  AdminProductSubscriptionQueryDto,
  ChangeProductSubscriptionFrequencyDto,
  ActivateProductSubscriptionFromPaidOrderDto,
  CreateProductSubscriptionDto,
  ListMyProductSubscriptionsQueryDto,
  ProductSubscriptionConfigQueryDto,
  ProductSubscriptionQuoteDto,
  UpdateProductSubscriptionQuantityDto,
  VerifyProductSubscriptionPaymentDto,
} from '../dto/product-subscription.dto';
import { ProductSubscriptionStatus } from '../enums/product-subscription-status.enum';
import { ProductSubscriptionFrequency } from '../enums/product-subscription-frequency.enum';
import { SubscriptionBillingCycleEntity } from '../entities/subscription-billing-cycle.entity';
import { SubscriptionMandateEntity } from '../entities/subscription-mandate.entity';
import { UserProductSubscriptionEntity } from '../entities/user-product-subscription.entity';
import { SubscriptionBillingCycleStatus } from '../enums/subscription-billing-cycle-status.enum';
import { SubscriptionHistoryAction } from '../enums/subscription-history-action.enum';
import { SubscriptionMissedPaymentAction } from '../enums/subscription-missed-payment-action.enum';
import { SubscriptionPaymentAttemptKind } from '../enums/subscription-payment-attempt-kind.enum';
import { SubscriptionPaymentStatus } from '../enums/subscription-payment-status.enum';
import { SubscriptionMandateProvider } from '../enums/subscription-mandate-provider.enum';
import { SubscriptionRenewalMethod } from '../enums/subscription-renewal-method.enum';
import { SUBSCRIPTION_ERROR, describeProductFrequency } from '../constants/subscription.constants';
import { SUBSCRIPTION_PAYMENT_PURPOSE } from '../constants/subscription-payment-purpose.constants';
import { mapUserProductSubscriptionToResponse } from '../mappers/product-subscription.mapper';
import { rewriteCashfreeHostedCheckoutUrl } from '@modules/payment-requests/utils/cashfree-checkout-url.util';
import { checkoutExtrasFromLink, paymentSessionIdFromLink } from '../utils/checkout-extras.util';
import { cashfreeSubscriptionReturnUrl } from '../utils/cashfree-subscription-return-url.util';
import {
  CASHFREE_CHARGE_MAX_LEAD_DAYS,
  CASHFREE_MISSED_SCHEDULE_REASON,
  cashfreeChargeAttemptMetadata,
  nextCashfreeUpiScheduleDate,
  nextCashfreeCardScheduleDate,
  nextLegalCashfreeChargeDate,
  resolveCashfreeChargeSchedule,
} from '../utils/cashfree-schedule-date.util';
import { resolveCashfreeMerchantSubscriptionId } from '../utils/cashfree-subscription-id.util';
import { AUTOPAY_TRACE, formatIstDate, isHourlyAutopayTrace } from '../utils/autopay-trace.util';
import { isCashfreeAdvanceChargeEnabled } from '../utils/subscriptions-module.util';
import { UserProductSubscriptionsRepository } from '../repositories/user-product-subscriptions.repository';
import { SubscriptionReminderLogsRepository } from '../repositories/subscription-reminder-logs.repository';
import { SubscriptionStatusHistoryRepository } from '../repositories/subscription-status-history.repository';
import {
  calendarDaysUntil,
  resolveReminderOffsets,
} from '../utils/subscription-calendar-days.util';
import { buildBillingCycleRef } from '../utils/billing-cycle-ref.util';
import { buildSubscriptionGatewayNotes } from '../utils/subscription-gateway-notes.util';
import { isAmountWithinMandateLimit, resolveMandateMaxAmount } from '../utils/mandate-amount.util';
import {
  buildRenewalPricingSnapshot,
  isBillingCyclePricingLocked,
  MANDATE_LIMIT_EXCEEDED_REASON,
  PRODUCT_UNAVAILABLE_REASON,
  SubscriptionRenewalQuote,
} from '../utils/subscription-pricing-snapshot.util';
import {
  advancePastMissedCycles,
  getEstimatedDeliveryDate,
  getNextProductBillingDate,
  scheduleAnchorDay,
} from '../utils/next-billing-date.util';
import {
  isChangeCutoffReached,
  isCycleInFlight,
} from '../utils/subscription-cycle-guard.util';
import { assertProductFrequenciesAllowed, isSubscriptionTestTenuresEnabled, TEST_PRODUCT_FREQUENCIES } from '../utils/subscription-test-tenures.util';
import { razorpayUpiDebitAt, UPI_DEBIT_ABSENT_RETRY_MS } from '../utils/razorpay-upi-debit.util';
import { resolveSubscriptionPaymentPhase } from '../utils/subscription-payment-phase.util';
import { IUserProductSubscription } from '../interfaces/product-subscription.interface';
import { MembershipBenefitsApplicationService } from './membership-benefits-application.service';
import { ProductSubscriptionConfigService } from './product-subscription-config.service';
import { ProductSubscriptionPaymentsService } from './product-subscription-payments.service';
import { ProductSubscriptionPricingService } from './product-subscription-pricing.service';
import { SubscriptionBillingCycleService } from './subscription-billing-cycle.service';
import { SubscriptionLockService } from './subscription-lock.service';
import { SubscriptionMandateService } from './subscription-mandate.service';
import { SubscriptionNotificationsService } from './subscription-notifications.service';
import { SubscriptionPaymentLinkService } from './subscription-payment-link.service';
import { RazorpayRecurringProvider } from './providers/razorpay-recurring.provider';
import { SubscriptionRelationLoaderService } from './subscription-relation-loader.service';

@Injectable()
export class ProductSubscriptionsService {
  private readonly logger = new Logger(ProductSubscriptionsService.name);

  constructor(
    private readonly subscriptionsRepository: UserProductSubscriptionsRepository,
    private readonly configService: ProductSubscriptionConfigService,
    private readonly pricingService: ProductSubscriptionPricingService,
    private readonly paymentsService: ProductSubscriptionPaymentsService,
    private readonly paymentLinkService: SubscriptionPaymentLinkService,
    private readonly notificationsService: SubscriptionNotificationsService,
    private readonly membershipBenefits: MembershipBenefitsApplicationService,
    private readonly productsRepository: ProductsRepository,
    private readonly variantsRepository: ProductVariantsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly addressesRepository: UserAddressesRepository,
    private readonly relationLoader: SubscriptionRelationLoaderService,
    private readonly mandateService: SubscriptionMandateService,
    private readonly billingCycleService: SubscriptionBillingCycleService,
    private readonly lockService: SubscriptionLockService,
    private readonly historyRepository: SubscriptionStatusHistoryRepository,
    private readonly nestConfig: NestConfigService,
    private readonly auditService: AuditService,
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
    private readonly reminderLogsRepository: SubscriptionReminderLogsRepository,
  ) {}

  async getConfig(query: ProductSubscriptionConfigQueryDto) {
    const config = await this.configService.findForProductVariant(
      query.productId,
      query.productVariantId ?? null,
    );
    if (!config || !config.enabled) {
      return null;
    }
    const testTenures = isSubscriptionTestTenuresEnabled(this.nestConfig);
    const frequencies = (config.frequencies ?? []).filter(
      (frequency) => testTenures || !TEST_PRODUCT_FREQUENCIES.has(frequency),
    );
    if (!frequencies.length) return null;
    const autopayFeatureEnabled = this.mandateService.isAutopayFeatureEnabled();
    const mandateMaxConfigured = Boolean(config.mandateMaxAmount);
    const autopayAvailable = autopayFeatureEnabled && mandateMaxConfigured;
    return {
      ...config,
      frequencies,
      intervalLabels: frequencies.map((frequency) => ({
        frequency,
        ...describeProductFrequency(frequency),
      })),
      autopayAvailable,
      autopayUnavailableReason: autopayAvailable
        ? null
        : autopayFeatureEnabled
          ? 'Mandate maximum amount is not configured'
          : 'AutoPay is not enabled for this merchant yet. Recurring cycles use a manual payment link.',
    };
  }

  async quote(userId: string | undefined, dto: ProductSubscriptionQuoteDto) {
    const { product, variant, config } = await this.assertEligibleProduct(
      dto.productId,
      dto.productVariantId,
      dto.frequency,
    );
    const memberDiscount = userId ? await this.membershipBenefits.getMemberDiscount(userId) : null;
    const pricing = this.pricingService.calculate(
      variant.sellingPrice,
      dto.quantity,
      config.discountType,
      config.discountValue,
      memberDiscount,
    );
    const described = describeProductFrequency(dto.frequency);
    const registersMandate = this.mandateService.willRegisterMandateOnFirstCharge({
      amount: pricing.finalAmount,
      productMandateMaxAmount: config.mandateMaxAmount,
    });
    return {
      productId: product.id,
      productVariantId: variant.id,
      quantity: dto.quantity,
      frequency: dto.frequency,
      ...described,
      intervalLabel: described.label,
      catalogUnitPrice: Number(variant.sellingPrice).toFixed(2),
      ...pricing,
      memberDiscountApplied: !!memberDiscount,
      mixedCart: {
        supported: true,
        behavior:
          'One-time and Subscribe & Save items may share a cart. Subscription discount applies only to subscription lines. First payment uses existing GoKwik or native checkout. The paid order is created once; each subscription line is activated afterwards.',
      },
      firstPayment: {
        routedThroughExistingCheckout: !registersMandate,
        isMandateAuthorization: registersMandate,
      },
      autopay: {
        enabled: this.mandateService.isAutopayFeatureEnabled(),
        ready: false,
        requiresSeparateMandateSetup: !registersMandate,
      },
    };
  }

  async create(userId: string, dto: CreateProductSubscriptionDto) {
    const product = await this.productsRepository.findPublishedById(dto.productId);
    if (!product || product.status !== ProductStatus.PUBLISHED) {
      throw new BadRequestException('Product is not available for subscription');
    }

    const variant = await this.variantsRepository.findById(dto.productVariantId);
    if (
      !variant ||
      variant.productId !== dto.productId ||
      variant.status !== VariantStatus.ACTIVE
    ) {
      throw new BadRequestException('Product variant is not available for subscription');
    }

    const configEntity = await this.configService.findEntityForProductVariant(
      dto.productId,
      dto.productVariantId,
    );
    if (!configEntity || !configEntity.enabled) {
      throw new BadRequestException('Subscription config is not enabled');
    }
    if (!configEntity.frequencies.includes(dto.frequency)) {
      throw new BadRequestException('Selected frequency is not allowed for this product');
    }

    const address = await this.addressesRepository.findByIdAndUserId(dto.addressId, userId);
    if (!address) {
      throw new BadRequestException('Delivery address not found');
    }

    const previous = await this.subscriptionsRepository.findByUserId(userId);
    const sameVariant = previous.filter(
      (row) =>
        row.productId === dto.productId && row.productVariantId === dto.productVariantId,
    );
    const alreadyOwned = sameVariant.find((row) =>
      [
        ProductSubscriptionStatus.ACTIVE,
        ProductSubscriptionStatus.RENEWAL_PAYMENT_PENDING,
        ProductSubscriptionStatus.PAST_DUE,
        ProductSubscriptionStatus.PAUSED,
      ].includes(row.status),
    );
    if (alreadyOwned) {
      throw new BadRequestException('You already have a subscription for this product option');
    }
    for (const row of sameVariant) {
      if (row.status !== ProductSubscriptionStatus.PENDING_PAYMENT) continue;
      if (await this.cashfreeAuthorizationInProgress(row.id)) {
        return this.reuseCashfreeCheckout(userId, row.id);
      }
      await this.abandonUnpaid(userId, row.id);
    }

    const memberDiscount = await this.membershipBenefits.getMemberDiscount(userId);
    const pricing = this.pricingService.calculate(
      variant.sellingPrice,
      dto.quantity,
      configEntity.discountType,
      configEntity.discountValue,
      memberDiscount,
    );

    const refId = await generateUniqueRefId('ups', (c) =>
      this.subscriptionsRepository.existsByRefId(c),
    );

    const timezone = configEntity.timezone || this.nestConfig.get<string>('subscriptions.timezone') || 'Asia/Kolkata';
    const now = new Date();
    const subscription = await this.subscriptionsRepository.create({
      refId,
      userId,
      productId: dto.productId,
      productVariantId: dto.productVariantId,
      addressId: dto.addressId,
      quantity: dto.quantity,
      frequency: dto.frequency,
      subscriptionPrice: pricing.subscriptionPrice,
      discountValue: configEntity.discountValue,
      finalAmount: pricing.finalAmount,
      discountType: configEntity.discountType,
      status: ProductSubscriptionStatus.PENDING_PAYMENT,
      renewalMethod: SubscriptionRenewalMethod.PAYMENT_LINK,
      autopayReady: false,
      timezone,
      scheduleAnchorDay: scheduleAnchorDay(now, timezone),
      mandateMaxAmount: resolveMandateMaxAmount({
        productMandateMaxAmount: configEntity.mandateMaxAmount,
        globalMandateMaxAmount: this.nestConfig.get<string>('subscriptions.mandateMaxAmount'),
      }),
      configId: configEntity.id,
      billingCycleSequence: 0,
      createdBy: userId,
      updatedBy: userId,
    });

    const billingDate = new Date();
    const billingCycleRef = buildBillingCycleRef(billingDate, dto.frequency);
    const payment = await this.paymentsService.upsertPendingCycle({
      subscriptionId: subscription.id,
      userId,
      billingCycleRef,
      amount: pricing.finalAmount,
      billingDate,
      actor: userId,
    });
    const deliveryLead = configEntity.deliveryLeadDays ?? 2;
    const cycle = await this.billingCycleService.getOrCreate({
      subscriptionId: subscription.id,
      userId,
      billingCycleRef,
      sequence: 1,
      chargeDate: billingDate,
      estimatedDeliveryDate: getEstimatedDeliveryDate(billingDate, deliveryLead),
      amount: pricing.finalAmount,
      actor: userId,
    });
    await this.paymentsService.attachCycleMetadata(payment.id, {
      billingCycleId: cycle.id,
      attemptKind: SubscriptionPaymentAttemptKind.FIRST_ORDER,
      actor: userId,
    });

    const user = await this.usersRepository.findById(userId);
    const customer = {
      id: userId,
      name: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || undefined,
      email: user?.email,
      phone: user?.mobileNumber ?? '',
    };
    const notes = buildSubscriptionGatewayNotes({
      paymentPurpose: SUBSCRIPTION_PAYMENT_PURPOSE.PRODUCT_SUBSCRIPTION,
      billingCycleRef,
      subscriptionId: subscription.id,
      subscriptionPaymentId: payment.id,
      userId,
      productId: dto.productId,
    });
    let firstChargeMandate: Awaited<
      ReturnType<SubscriptionMandateService['tryStartFirstChargeAuthorization']>
    > = null;
    try {
      firstChargeMandate = await this.mandateService.tryStartFirstChargeAuthorization({
        subscription,
        customer,
        actor: userId,
        amount: pricing.finalAmount,
        productMandateMaxAmount: configEntity.mandateMaxAmount,
        notes,
        method: dto.autopayMethod,
        returnUrl: cashfreeSubscriptionReturnUrl(
          this.nestConfig.get<string>('STOREFRONT_URL'),
          subscription.id,
        ),
      });
    } catch (error) {
      await this.abandonUnpaid(userId, subscription.id);
      throw error;
    }
    const session = firstChargeMandate?.session;
    const isCashfree = session?.provider === 'CASHFREE';
    const checkoutEnvironment: 'sandbox' | 'production' | undefined =
      session?.checkoutPayload.environment === 'sandbox'
        ? 'sandbox'
        : session?.checkoutPayload.environment === 'production'
          ? 'production'
          : undefined;
    const checkoutMethod: 'upi' | 'card' | 'emandate' =
      dto.autopayMethod === 'card' ? 'card' : dto.autopayMethod === 'emandate' ? 'emandate' : 'upi';
    const link = session
      ? {
          paymentLink: session.authorizationLink ?? null,
          gatewayOrderId: session.authorizationOrderId,
          paymentGateway: isCashfree ? 'CASHFREE' : 'RAZORPAY',
          razorpayOrderId: isCashfree ? null : session.authorizationOrderId,
          keyId: session.keyId ?? null,
          amount: session.amountPaise ?? null,
          currency: session.currency,
          paymentSessionId: session.paymentSessionId ?? null,
          environment: checkoutEnvironment,
          customer: {
            name: customer.name || customer.phone,
            email: customer.email ?? '',
            contact: customer.phone,
          },
          recurring: isCashfree ? null : '1',
          gatewayCustomerId: session.gatewayCustomerId ?? null,
          subscriptionCheckout: isCashfree,
          autopayMethod: checkoutMethod,
        }
      : await this.paymentLinkService.createPaymentLink({
          amount: pricing.finalAmount,
          currency: 'INR',
          referenceId: payment.refId,
          customer,
          notes,
          description: `Product subscription ${subscription.refId}`,
        });

    await this.paymentsService.attachPaymentLink(payment.id, {
      paymentLink: link.paymentLink ?? '',
      gatewayOrderId: link.gatewayOrderId,
      paymentGateway: link.paymentGateway,
      actor: userId,
    });
    await this.subscriptionsRepository.updateById(subscription.id, {
      paymentGateway: link.paymentGateway,
      updatedBy: userId,
    });

    this.notificationsService.notifyPaymentLinkCreated({
      userId,
      kind: 'product_subscription',
      paymentLink: link.paymentLink ?? '',
      amount: pricing.finalAmount,
      refId: subscription.refId,
    });

    const refreshed = await this.subscriptionsRepository.findById(subscription.id);
    return this.mapOwned(refreshed ?? subscription, checkoutExtrasFromLink(link));
  }

  /**
   * Cart/checkout already charged and created an order. Create or activate the
   * product subscription against that paid order — do not charge again or
   * create a second order.
   */
  async activateFromPaidOrder(
    userId: string,
    dto: ActivateProductSubscriptionFromPaidOrderDto,
  ) {
    const order = await this.ordersService.findPaidOrderForSubscriptionAttach({
      userId,
      productId: dto.productId,
      productVariantId: dto.productVariantId,
      orderRef: dto.orderRef,
    });
    if (!order) {
      throw new BadRequestException(
        'Paid order not found for this product. Wait a moment and try again from Subscriptions.',
      );
    }

    const product = await this.productsRepository.findPublishedById(dto.productId);
    if (!product || product.status !== ProductStatus.PUBLISHED) {
      throw new BadRequestException('Product is not available for subscription');
    }

    const variant = await this.variantsRepository.findById(dto.productVariantId);
    if (
      !variant ||
      variant.productId !== dto.productId ||
      variant.status !== VariantStatus.ACTIVE
    ) {
      throw new BadRequestException('Product variant is not available for subscription');
    }

    const configEntity = await this.configService.findEntityForProductVariant(
      dto.productId,
      dto.productVariantId,
    );
    if (!configEntity || !configEntity.enabled) {
      throw new BadRequestException('Subscription config is not enabled');
    }
    if (!configEntity.frequencies.includes(dto.frequency)) {
      throw new BadRequestException('Selected frequency is not allowed for this product');
    }

    const address = await this.addressesRepository.findByIdAndUserId(dto.addressId, userId);
    if (!address) {
      throw new BadRequestException('Delivery address not found');
    }

    const existing = (await this.subscriptionsRepository.findByUserId(userId)).filter(
      (row) => row.productId === dto.productId && row.productVariantId === dto.productVariantId,
    );
    const alreadyActive = existing.find(
      (row) =>
        row.status === ProductSubscriptionStatus.ACTIVE ||
        row.status === ProductSubscriptionStatus.PAUSED,
    );
    if (alreadyActive) {
      if (!order.subscriptionId) {
        await this.ordersService.attachSubscriptionIdToOrder(
          order.id,
          alreadyActive.id,
          userId,
        );
      }
      return this.getMine(userId, alreadyActive.id);
    }

    const pending = existing.find(
      (row) => row.status === ProductSubscriptionStatus.PENDING_PAYMENT,
    );

    const memberDiscount = await this.membershipBenefits.getMemberDiscount(userId);
    const pricing = this.pricingService.calculate(
      variant.sellingPrice,
      dto.quantity,
      configEntity.discountType,
      configEntity.discountValue,
      memberDiscount,
    );

    const timezone = configEntity.timezone || this.nestConfig.get<string>('subscriptions.timezone') || 'Asia/Kolkata';
    const now = new Date();
    const nextBilling = getNextProductBillingDate(now, dto.frequency, timezone, scheduleAnchorDay(now, timezone));
    const deliveryLead = configEntity.deliveryLeadDays ?? this.nestConfig.get<number>('subscriptions.deliveryLeadDays') ?? 2;

    let subscriptionId: string;
    if (pending) {
      await this.subscriptionsRepository.updateById(pending.id, {
        addressId: dto.addressId,
        quantity: dto.quantity,
        frequency: dto.frequency,
        subscriptionPrice: pricing.subscriptionPrice,
        discountValue: configEntity.discountValue,
        finalAmount: pricing.finalAmount,
        discountType: configEntity.discountType,
        status: ProductSubscriptionStatus.ACTIVE,
        startDate: pending.startDate ?? now,
        nextBillingDate: nextBilling,
        nextDeliveryDate: getEstimatedDeliveryDate(nextBilling, deliveryLead),
        billingCycleSequence: Math.max(1, pending.billingCycleSequence ?? 0),
        timezone,
        scheduleAnchorDay: pending.scheduleAnchorDay ?? scheduleAnchorDay(now, timezone),
        autopayReady: false,
        renewalMethod: SubscriptionRenewalMethod.PAYMENT_LINK,
        firstOrderId: order.id,
        updatedBy: userId,
      });
      subscriptionId = pending.id;
      const payments = await this.paymentsService.findBySubscriptionId(pending.id);
      const unpaid = payments.find(
        (p) =>
          p.status === SubscriptionPaymentStatus.PENDING ||
          p.status === SubscriptionPaymentStatus.LINK_GENERATED,
      );
      if (unpaid) {
        await this.paymentsService.markPaidIdempotent(unpaid.id, { actor: userId });
      }
    } else {
      const refId = await generateUniqueRefId('ups', (c) =>
        this.subscriptionsRepository.existsByRefId(c),
      );
      const subscription = await this.subscriptionsRepository.create({
        refId,
        userId,
        productId: dto.productId,
        productVariantId: dto.productVariantId,
        addressId: dto.addressId,
        quantity: dto.quantity,
        frequency: dto.frequency,
        subscriptionPrice: pricing.subscriptionPrice,
        discountValue: configEntity.discountValue,
        finalAmount: pricing.finalAmount,
        discountType: configEntity.discountType,
        status: ProductSubscriptionStatus.ACTIVE,
        startDate: now,
        nextBillingDate: nextBilling,
        nextDeliveryDate: getEstimatedDeliveryDate(nextBilling, deliveryLead),
        renewalMethod: SubscriptionRenewalMethod.PAYMENT_LINK,
        autopayReady: false,
        timezone,
        scheduleAnchorDay: scheduleAnchorDay(now, timezone),
        firstOrderId: order.id,
        mandateMaxAmount: resolveMandateMaxAmount({
          productMandateMaxAmount: configEntity.mandateMaxAmount,
          globalMandateMaxAmount: this.nestConfig.get<string>('subscriptions.mandateMaxAmount'),
        }),
        configId: configEntity.id,
        billingCycleSequence: 1,
        createdBy: userId,
        updatedBy: userId,
      });
      subscriptionId = subscription.id;

      const billingCycleRef = buildBillingCycleRef(now, dto.frequency);
      const payment = await this.paymentsService.upsertPendingCycle({
        subscriptionId: subscription.id,
        userId,
        billingCycleRef,
        amount: pricing.finalAmount,
        billingDate: now,
        actor: userId,
      });
      await this.paymentsService.markPaidIdempotent(payment.id, { actor: userId });
    }

    await this.ordersService.attachSubscriptionIdToOrder(order.id, subscriptionId, userId);
    return this.getMine(userId, subscriptionId);
  }

  async listMine(userId: string, query?: ListMyProductSubscriptionsQueryDto) {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 20;
    const { data, total } = await this.subscriptionsRepository.findPaginated({
      page,
      limit,
      userId,
    });
    const items = await this.mapSubscriptionsWithRelations(data);
    await this.applyPaymentPhase(items);
    return {
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async getMine(userId: string, id: string) {
    const sub = await this.subscriptionsRepository.findByIdAndUserId(id, userId);
    if (!sub) throw new NotFoundException('Subscription not found');
    await this.settleReconcilingPayments(id);
    const refreshed = (await this.subscriptionsRepository.findByIdAndUserId(id, userId)) ?? sub;
    const [mapped] = await this.mapSubscriptionsWithRelations([refreshed]);
    if (mapped) await this.applyPaymentPhase([mapped]);
    return mapped;
  }

  async pause(userId: string, id: string, reason?: string, actor = userId) {
    const sub = await this.requireOwnedActiveLike(userId, id);
    if (sub.config && !sub.config.pauseAllowed) {
      throw new BadRequestException('Pause is not allowed for this subscription');
    }
    await this.assertNotInFlight(sub, 'pause');
    await this.subscriptionsRepository.updateById(id, {
      status: ProductSubscriptionStatus.PAUSED,
      pausedAt: new Date(),
      cancellationReason: reason ?? sub.cancellationReason,
      updatedBy: actor,
    });
    await this.historyRepository.append({
      subscriptionId: id,
      action: SubscriptionHistoryAction.PAUSED,
      performedBy: actor,
      fromStatus: sub.status,
      toStatus: ProductSubscriptionStatus.PAUSED,
      reason,
    });
    if (actor !== userId) {
      await this.auditService.log({
        entityType: AuditEntityType.PRODUCT_SUBSCRIPTION,
        entityId: id,
        entityRefId: sub.refId,
        action: 'pause',
        performedBy: actor,
        details: { reason },
      });
    }
    return this.getMine(userId, id);
  }

  async resume(userId: string, id: string, actor = userId) {
    const sub = await this.subscriptionsRepository.findByIdAndUserId(id, userId);
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.status !== ProductSubscriptionStatus.PAUSED) {
      throw new BadRequestException('Only paused subscriptions can be resumed');
    }
    await this.subscriptionsRepository.updateById(id, {
      status: ProductSubscriptionStatus.ACTIVE,
      pausedAt: null,
      pauseUntil: null,
      updatedBy: actor,
    });
    await this.historyRepository.append({
      subscriptionId: id,
      action: SubscriptionHistoryAction.RESUMED,
      performedBy: actor,
      fromStatus: sub.status,
      toStatus: ProductSubscriptionStatus.ACTIVE,
    });
    return this.getMine(userId, id);
  }

  /**
   * Opening the payment window creates a pending row so the gateway has an order.
   * Closing that window without payment removes the row. A captured payment is kept.
   */
  async abandonUnpaid(userId: string, id: string): Promise<{ abandoned: boolean }> {
    const sub = await this.subscriptionsRepository.findByIdAndUserId(id, userId);
    if (!sub || sub.status !== ProductSubscriptionStatus.PENDING_PAYMENT) {
      return { abandoned: false };
    }

    const payments = await this.paymentsService.findBySubscriptionId(id);
    if (
      payments.some(
        (payment) =>
          payment.status === SubscriptionPaymentStatus.PAID ||
          payment.status === SubscriptionPaymentStatus.RECONCILING,
      )
    ) {
      return { abandoned: false };
    }
    if (await this.cashfreeAuthorizationInProgress(id)) {
      return { abandoned: false };
    }

    await this.subscriptionsRepository.softDeleteById(id, userId);
    return { abandoned: true };
  }

  async cancel(userId: string, id: string, reason?: string) {
    const sub = await this.subscriptionsRepository.findByIdAndUserId(id, userId);
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.config && !sub.config.cancellationAllowed) {
      throw new BadRequestException('Cancellation is not allowed for this subscription');
    }
    if (
      [ProductSubscriptionStatus.CANCELLED, ProductSubscriptionStatus.EXPIRED].includes(sub.status)
    ) {
      throw new BadRequestException('Subscription is already ended');
    }
    await this.mandateService.revokeForSubscription(id, userId);
    await this.subscriptionsRepository.updateById(id, {
      status: ProductSubscriptionStatus.CANCELLED,
      cancellationDate: new Date(),
      cancellationReason: reason ?? null,
      autopayReady: false,
      nextBillingDate: null,
      nextDeliveryDate: null,
      updatedBy: userId,
    });
    await this.historyRepository.append({
      subscriptionId: id,
      action: SubscriptionHistoryAction.CANCELLED,
      performedBy: userId,
      fromStatus: sub.status,
      toStatus: ProductSubscriptionStatus.CANCELLED,
      reason,
    });
    this.notificationsService.notifyCancelled({
      userId,
      kind: 'product_subscription',
      refId: sub.refId,
    });
    return this.getMine(userId, id);
  }

  async skipNext(userId: string, id: string, actor = userId) {
    const sub = await this.requireOwnedActiveLike(userId, id);
    if (sub.config && !sub.config.skipAllowed) {
      throw new BadRequestException('Skip is not allowed for this subscription');
    }
    await this.assertNotInFlight(sub, 'skip');
    const timezone = sub.timezone || 'Asia/Kolkata';
    const from = sub.nextBillingDate ?? new Date();
    const next = getNextProductBillingDate(from, sub.frequency, timezone, sub.scheduleAnchorDay);
    const deliveryLead = sub.config?.deliveryLeadDays ?? 2;
    await this.subscriptionsRepository.updateById(id, {
      nextBillingDate: next,
      nextDeliveryDate: getEstimatedDeliveryDate(next, deliveryLead),
      skipNextCycle: false,
      updatedBy: actor,
    });
    const skippedRef = buildBillingCycleRef(from, sub.frequency);
    const cycle = await this.billingCycleService.getOrCreate({
      subscriptionId: sub.id,
      userId,
      billingCycleRef: skippedRef,
      sequence: sub.billingCycleSequence + 1,
      chargeDate: from,
      estimatedDeliveryDate: getEstimatedDeliveryDate(from, deliveryLead),
      amount: sub.finalAmount,
      actor,
    });
    await this.billingCycleService.updateById(cycle.id, {
      status: SubscriptionBillingCycleStatus.SKIPPED,
      skipReason: 'CUSTOMER_SKIP',
      updatedBy: actor,
    });
    await this.historyRepository.append({
      subscriptionId: id,
      action: SubscriptionHistoryAction.SKIPPED,
      performedBy: actor,
      details: { skippedCycleRef: skippedRef, nextBillingDate: next.toISOString() },
    });
    return this.getMine(userId, id);
  }

  async changeFrequency(
    userId: string,
    id: string,
    dto: ChangeProductSubscriptionFrequencyDto,
  ) {
    const sub = await this.requireOwnedActiveLike(userId, id);
    if (sub.config && !sub.config.frequencyChangeAllowed) {
      throw new BadRequestException('Frequency change is not allowed');
    }
    if (sub.config && !sub.config.frequencies.includes(dto.frequency)) {
      throw new BadRequestException('Selected frequency is not allowed');
    }
    await this.assertNotInFlight(sub, 'change frequency');
    await this.subscriptionsRepository.updateById(id, {
      frequency: dto.frequency,
      updatedBy: userId,
    });
    await this.historyRepository.append({
      subscriptionId: id,
      action: SubscriptionHistoryAction.FREQUENCY_CHANGED,
      performedBy: userId,
      details: { from: sub.frequency, to: dto.frequency },
    });
    return this.getMine(userId, id);
  }

  async updateAddress(userId: string, id: string, addressId: string) {
    const sub = await this.subscriptionsRepository.findByIdAndUserId(id, userId);
    if (!sub) throw new NotFoundException('Subscription not found');
    const address = await this.addressesRepository.findByIdAndUserId(addressId, userId);
    if (!address) throw new BadRequestException('Delivery address not found');
    await this.assertNotInFlight(sub, 'change address');
    await this.subscriptionsRepository.updateById(id, { addressId, updatedBy: userId });
    await this.historyRepository.append({
      subscriptionId: id,
      action: SubscriptionHistoryAction.ADDRESS_CHANGED,
      performedBy: userId,
      details: { from: sub.addressId, to: addressId },
    });
    return this.getMine(userId, id);
  }

  async retryPayment(userId: string, id: string) {
    const sub = await this.subscriptionsRepository.findByIdAndUserId(id, userId);
    if (!sub) throw new NotFoundException('Subscription not found');
    if (
      ![
        ProductSubscriptionStatus.PENDING_PAYMENT,
        ProductSubscriptionStatus.RENEWAL_PAYMENT_PENDING,
        ProductSubscriptionStatus.PAST_DUE,
      ].includes(sub.status)
    ) {
      throw new BadRequestException('No pending payment to retry');
    }

    await this.settleReconcilingPayments(id);
    return this.lockService.withDbLock(`retry:${id}`, () => this.retryPaymentLocked(userId, sub));
  }

  private async retryPaymentLocked(userId: string, sub: UserProductSubscriptionEntity) {
    const payments = await this.paymentsService.findBySubscriptionId(sub.id);
    if (payments.some((payment) => payment.status === SubscriptionPaymentStatus.PAID)) {
      return this.getMine(userId, sub.id);
    }
    const reconciling = payments.find((payment) => payment.status === SubscriptionPaymentStatus.RECONCILING);
    if (reconciling) {
      const recovered = await this.reconcileAmbiguousCardCharge(reconciling);
      if (recovered === 'settled') return this.getMine(userId, sub.id);
      if (recovered !== 'retryable') {
        throw new BadRequestException(
          'A subscription payment is already being confirmed. The order appears after that payment is captured.',
        );
      }
    }
    const fresh = await this.paymentsService.findBySubscriptionId(sub.id);
    if (fresh.some((payment) => payment.status === SubscriptionPaymentStatus.PAID)) {
      return this.getMine(userId, sub.id);
    }
    const mandate = await this.mandateService.getForSubscription(sub.id);
    const existing = fresh.find(
      (payment) =>
        payment.status === SubscriptionPaymentStatus.LINK_GENERATED &&
        Boolean(payment.paymentLink) &&
        Boolean(payment.gatewayOrderId) &&
        payment.gatewayOrderId !== mandate?.authorizationOrderId,
    );
    if (existing?.paymentLink) {
      if (!this.isStaleCashfreeCheckout(existing)) {
        return this.mapOwned(sub, {
          paymentLink: existing.paymentLink,
          razorpayOrderId: existing.gatewayOrderId ?? null,
        });
      }
      const refreshed = await this.refreshCashfreeCheckoutSession(sub, existing, userId);
      if (refreshed?.paymentLink) {
        return this.mapOwned(sub, {
          paymentLink: refreshed.paymentLink,
          razorpayOrderId: refreshed.gatewayOrderId ?? null,
        });
      }
    }
    const gate = await this.blockRetryWhileGatewayChargeIsOpen(fresh, sub.id);
    if (gate === 'settled') return this.getMine(userId, sub.id);
    if (gate === 'in_flight') {
      throw new BadRequestException(
        'A subscription payment is already being confirmed. The order appears after that payment is captured.',
      );
    }
    const failed = fresh.find((payment) => payment.status === SubscriptionPaymentStatus.FAILED);
    if (!failed) {
      throw new BadRequestException(
        'A subscription payment is already being confirmed. The order appears after that payment is captured.',
      );
    }
    const claimed = await this.paymentsService.claimRetry(failed.id, userId);
    if (!claimed) {
      const again = await this.paymentsService.findById(failed.id);
      if (again?.status === SubscriptionPaymentStatus.LINK_GENERATED && again.paymentLink) {
        return this.mapOwned(sub, {
          paymentLink: again.paymentLink,
          razorpayOrderId: again.gatewayOrderId ?? null,
        });
      }
      throw new BadRequestException(
        'A subscription payment is already being confirmed. The order appears after that payment is captured.',
      );
    }

    const billingDate = sub.nextBillingDate ?? new Date();
    const billingCycleRef = failed.billingCycleRef || buildBillingCycleRef(billingDate, sub.frequency);
    const amount = failed.amount || (await this.recalculateAmount(sub));
    const user = await this.usersRepository.findById(userId);
    const persistedGateway = (sub.paymentGateway ?? '').toUpperCase();
    const link = await this.paymentLinkService.createPaymentLink({
      amount,
      referenceId: `${failed.refId ?? failed.id}-R${(failed.retryCount ?? 0) + 1}`.slice(0, 40),
      preferredGateway:
        persistedGateway === 'RAZORPAY' || persistedGateway === 'CASHFREE'
          ? persistedGateway
          : null,
      customer: {
        id: userId,
        name: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || undefined,
        email: user?.email,
        phone: user?.mobileNumber ?? '',
      },
      notes: buildSubscriptionGatewayNotes({
        paymentPurpose: SUBSCRIPTION_PAYMENT_PURPOSE.PRODUCT_SUBSCRIPTION,
        billingCycleRef,
        subscriptionId: sub.id,
        subscriptionPaymentId: failed.id,
        userId,
        productId: sub.productId,
      }),
    });
    await this.paymentsService.attachPaymentLink(failed.id, {
      paymentLink: link.paymentLink ?? '',
      gatewayOrderId: link.gatewayOrderId,
      paymentGateway: link.paymentGateway,
      actor: userId,
    });
    this.notificationsService.notifyPaymentLinkCreated({
      userId,
      kind: 'product_subscription',
      paymentLink: link.paymentLink ?? '',
      amount,
      refId: sub.refId,
    });
    return this.mapOwned(sub, checkoutExtrasFromLink(link));
  }

  async verifyRazorpayPayment(
    userId: string,
    subscriptionId: string,
    dto: VerifyProductSubscriptionPaymentDto,
  ) {
    this.paymentLinkService.verifyRazorpaySignature(
      dto.razorpay_order_id,
      dto.razorpay_payment_id,
      dto.razorpay_signature,
    );

    const sub = await this.subscriptionsRepository.findByIdAndUserId(subscriptionId, userId);
    if (!sub) throw new NotFoundException('Subscription not found');

    const payment = await this.paymentsService.findByGatewayOrderId(dto.razorpay_order_id);
    if (!payment || payment.subscriptionId !== subscriptionId || payment.userId !== userId) {
      throw new BadRequestException('Payment does not match this subscription');
    }

    const captured = await this.isRazorpayChargeCaptured({
      gatewayOrderId: dto.razorpay_order_id,
      gatewayPaymentId: dto.razorpay_payment_id,
    });
    if (!captured) {
      throw new BadRequestException('Payment is not captured yet');
    }

    await this.handlePaymentSuccess({
      paymentId: payment.id,
      gatewayOrderId: dto.razorpay_order_id,
      gatewayPaymentId: dto.razorpay_payment_id,
      actor: userId,
    });

    return this.getMine(userId, subscriptionId);
  }

  async syncRazorpayPayment(userId: string, subscriptionId: string): Promise<{ paid: boolean }> {
    const sub = await this.subscriptionsRepository.findByIdAndUserId(subscriptionId, userId);
    if (!sub) throw new NotFoundException('Subscription not found');
    const mandate = await this.mandateService.getForSubscription(subscriptionId);
    if (mandate?.provider === SubscriptionMandateProvider.CASHFREE) {
      await this.settleReconcilingPayments(subscriptionId);
      const payments = await this.paymentsService.findBySubscriptionId(subscriptionId);
      if (payments.some((payment) => payment.status === SubscriptionPaymentStatus.PAID)) {
        return { paid: true };
      }
      const pending = [...payments]
        .reverse()
        .find(
          (payment) =>
            payment.status !== SubscriptionPaymentStatus.PAID &&
            payment.status !== SubscriptionPaymentStatus.FAILED,
        );
      if (!pending) return { paid: false };
      const settled = await this.settleCashfreeSubscriptionPayment({
        paymentId: pending.id,
        gatewayOrderId: pending.gatewayOrderId ?? undefined,
        gatewayPaymentId: pending.gatewayPaymentId ?? undefined,
        gatewaySubscriptionId: resolveCashfreeMerchantSubscriptionId(
          mandate.authorizationOrderId,
          mandate.gatewaySubscriptionId,
        ),
        actor: userId,
      });
      return { paid: settled };
    }
    await this.settleReconcilingPayments(subscriptionId);
    const payments = await this.paymentsService.findBySubscriptionId(subscriptionId);
    if (payments.some((payment) => payment.status === SubscriptionPaymentStatus.PAID)) {
      return { paid: true };
    }
    const pending = [...payments].reverse().find((payment) => payment.gatewayOrderId?.startsWith('order_'));
    if (!pending?.gatewayOrderId) return { paid: false };
    const adapter = this.mandateService.adapter(SubscriptionMandateProvider.RAZORPAY);
    if (!adapter.isConfigured()) return { paid: false };
    const snapshot = await adapter.fetchChargeStatus({
      gatewayOrderId: pending.gatewayOrderId,
      gatewayPaymentId: pending.gatewayPaymentId,
    });
    const registrationOrder = pending.gatewayOrderId === mandate?.authorizationOrderId;
    const card = mandate?.consentEvidence?.cardAuthOnly === true;
    const paysProduct = card
      ? this.cardProductCaptured(pending.amount, pending.currency, snapshot)
      : this.snapshotPaysProductAmount(pending.amount, snapshot) || snapshot.state === 'captured';
    if (!registrationOrder && paysProduct) {
      await this.handlePaymentSuccess({
        paymentId: pending.id,
        gatewayOrderId: snapshot.gatewayOrderId ?? pending.gatewayOrderId,
        gatewayPaymentId: snapshot.gatewayPaymentId ?? pending.gatewayPaymentId ?? undefined,
        actor: userId,
      });
    }
    const after = await this.paymentsService.findById(pending.id);
    return { paid: after?.status === SubscriptionPaymentStatus.PAID };
  }

  async tryHandlePaidByGatewayOrderId(
    gatewayOrderId?: string,
    gatewayPaymentId?: string,
    actor?: string,
  ): Promise<boolean> {
    if (!gatewayOrderId) return false;
    const payment = await this.paymentsService.findByGatewayOrderId(gatewayOrderId);
    if (!payment) return false;
    await this.handlePaymentSuccess({
      paymentId: payment.id,
      gatewayOrderId,
      gatewayPaymentId,
      actor,
    });
    return true;
  }

  async listPayments(userId: string, subscriptionId: string) {
    const sub = await this.subscriptionsRepository.findByIdAndUserId(subscriptionId, userId);
    if (!sub) throw new NotFoundException('Subscription not found');
    return this.paymentsService.findBySubscriptionId(subscriptionId);
  }

  async listCycles(userId: string, subscriptionId: string) {
    const sub = await this.subscriptionsRepository.findByIdAndUserId(subscriptionId, userId);
    if (!sub) throw new NotFoundException('Subscription not found');
    await this.ensureUpcomingBillingCycle(sub, userId);
    const [cycles, payments, reminders] = await Promise.all([
      this.billingCycleService.findBySubscriptionId(subscriptionId),
      this.paymentsService.findBySubscriptionId(subscriptionId),
      this.reminderLogsRepository.findBySubscriptionId(subscriptionId),
    ]);
    const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
    const paymentByCycleRef = new Map(payments.map((payment) => [payment.billingCycleRef, payment]));
    return cycles.map((cycle) => {
      const payment =
        (cycle.paymentId ? paymentById.get(cycle.paymentId) : undefined) ??
        paymentByCycleRef.get(cycle.billingCycleRef);
      const earlyPaymentEligible = this.isEarlyPaymentEligible(cycle, payment);
      const reminderLogs = reminders
        .filter((row) => row.billingCycleRef === cycle.billingCycleRef)
        .map((row) => ({
          daysBefore: row.daysBefore,
          channel: row.channel,
          sentAt: row.sentAt.toISOString(),
        }));
      return {
        id: cycle.id,
        refId: cycle.refId,
        billingCycleRef: cycle.billingCycleRef,
        sequence: cycle.sequence,
        status: cycle.status,
        chargeDate: cycle.chargeDate.toISOString(),
        estimatedDeliveryDate: cycle.estimatedDeliveryDate?.toISOString() ?? null,
        amount: cycle.amount,
        currency: cycle.currency,
        orderId: cycle.orderId,
        paymentId: cycle.paymentId,
        skipReason: cycle.skipReason,
        failureReason: cycle.failureReason,
        retryCount: cycle.retryCount,
        paymentLink: rewriteCashfreeHostedCheckoutUrl(
          payment?.paymentLink ?? null,
          this.nestConfig.get<string>('API_PUBLIC_URL') ||
            this.nestConfig.get<string>('STOREFRONT_URL'),
        ),
        paymentStatus: payment?.status ?? null,
        attemptKind: payment?.attemptKind ?? null,
        paymentGateway: payment?.paymentGateway ?? sub.paymentGateway ?? null,
        gatewayOrderId: payment?.gatewayOrderId ?? null,
        earlyPaymentEligible,
        reminderLogs,
      };
    });
  }

  async listHistory(userId: string | null, subscriptionId: string) {
    if (userId) {
      const sub = await this.subscriptionsRepository.findByIdAndUserId(subscriptionId, userId);
      if (!sub) throw new NotFoundException('Subscription not found');
    }
    const rows = await this.historyRepository.findBySubscriptionId(subscriptionId);
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      performedBy: row.performedBy,
      reason: row.reason,
      details: row.details,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async updateQuantity(userId: string, id: string, dto: UpdateProductSubscriptionQuantityDto) {
    const sub = await this.requireOwnedActiveLike(userId, id);
    if (!sub.config?.quantityChangeAllowed) {
      throw new BadRequestException({
        code: SUBSCRIPTION_ERROR.QUANTITY_CHANGE_DISABLED,
        message: 'Quantity change is not enabled for this product',
      });
    }
    await this.assertNotInFlight(sub, 'change quantity');
    const amount = await this.recalculateAmount({ ...sub, quantity: dto.quantity });
    await this.subscriptionsRepository.updateById(id, {
      quantity: dto.quantity,
      finalAmount: amount,
      updatedBy: userId,
    });
    await this.historyRepository.append({
      subscriptionId: id,
      action: SubscriptionHistoryAction.QUANTITY_CHANGED,
      performedBy: userId,
      details: { from: sub.quantity, to: dto.quantity },
    });
    return this.getMine(userId, id);
  }

  async authorizeMandate(userId: string, id: string) {
    const sub = await this.requireOwnedActiveLike(userId, id);
    const user = await this.usersRepository.findById(userId);
    const { mandate, session } = await this.mandateService.startAuthorization({
      subscription: sub,
      customer: {
        name: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || undefined,
        email: user?.email,
        phone: user?.mobileNumber ?? '',
      },
      actor: userId,
      returnUrl: cashfreeSubscriptionReturnUrl(this.nestConfig.get<string>('STOREFRONT_URL'), sub.id),
    });
    return {
      mandateId: mandate.id,
      status: mandate.status,
      provider: mandate.provider,
      maxAmount: mandate.maxAmount,
      currency: mandate.currency,
      authorization: session,
      note: 'Mandate authorisation is not proof of a product payment. Confirm status via GET /subscriptions/products/:id/mandate.',
    };
  }

  async getMandate(userId: string, id: string) {
    const sub = await this.subscriptionsRepository.findByIdAndUserId(id, userId);
    if (!sub) throw new NotFoundException('Subscription not found');
    const mandate = await this.mandateService.getForSubscription(id);
    return {
      autopayReady: this.mandateService.canPresentAsAutopay(sub, mandate),
      autopayFeatureEnabled: this.mandateService.isAutopayFeatureEnabled(),
      mandate: mandate
        ? {
            id: mandate.id,
            status: mandate.status,
            provider: mandate.provider,
            maxAmount: mandate.maxAmount,
            currency: mandate.currency,
            validUntil: mandate.validUntil?.toISOString() ?? null,
            authorizedAt: mandate.authorizedAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  async refreshMandate(userId: string, id: string) {
    const sub = await this.subscriptionsRepository.findByIdAndUserId(id, userId);
    if (!sub) throw new NotFoundException('Subscription not found');
    const mandate = await this.mandateService.getForSubscription(id);
    if (!mandate) throw new NotFoundException('Mandate not found');
    const snapshot = await this.mandateService.adapter(mandate.provider).fetchMandateStatus({
      gatewayMandateId: mandate.gatewayMandateId,
      gatewaySubscriptionId:
        mandate.provider === SubscriptionMandateProvider.CASHFREE
          ? resolveCashfreeMerchantSubscriptionId(
              mandate.authorizationOrderId,
              mandate.gatewaySubscriptionId,
            )
          : mandate.gatewaySubscriptionId,
      gatewayPaymentId: mandate.authorizationPaymentId,
      gatewayCustomerId: mandate.gatewayCustomerId,
    });
    if (snapshot.gatewayRead === false) {
      return this.getMandate(userId, id);
    }
    await this.mandateService.applyStatusSnapshot({
      mandateId: mandate.id,
      status: snapshot.status,
      gatewayMandateId: snapshot.gatewayMandateId,
      gatewaySubscriptionId: snapshot.gatewaySubscriptionId,
      actor: userId,
      raw: snapshot.raw,
    });
    return this.getMandate(userId, id);
  }

  async payCycle(userId: string, subscriptionId: string, cycleId: string) {
    const sub = await this.subscriptionsRepository.findByIdAndUserId(subscriptionId, userId);
    if (!sub) throw new NotFoundException('Subscription not found');
    const cycle = await this.billingCycleService.findById(cycleId);
    if (!cycle || cycle.subscriptionId !== subscriptionId) {
      throw new NotFoundException('Billing cycle not found');
    }
    if (
      cycle.status === SubscriptionBillingCycleStatus.PAID ||
      cycle.status === SubscriptionBillingCycleStatus.PAID_ORDER_PENDING
    ) {
      throw new BadRequestException({
        code: SUBSCRIPTION_ERROR.CYCLE_ALREADY_PAID,
        message: 'This cycle is already paid',
      });
    }
    if (cycle.status === SubscriptionBillingCycleStatus.DEBIT_PENDING) {
      throw new BadRequestException({
        code: SUBSCRIPTION_ERROR.CYCLE_IN_FLIGHT,
        message: 'An AutoPay debit is already in progress for this cycle',
      });
    }
    const paymentForCycle = cycle.paymentId
      ? await this.paymentsService.findById(cycle.paymentId)
      : (await this.paymentsService.findBySubscriptionId(subscriptionId)).find(
          (row) => row.billingCycleRef === cycle.billingCycleRef,
        );
    if (this.isAutopayCollectionInFlight(cycle, paymentForCycle)) {
      throw new BadRequestException({
        code: SUBSCRIPTION_ERROR.CYCLE_IN_FLIGHT,
        message:
          'An AutoPay charge is pending or reconciling for this cycle. Early payment is blocked until that charge settles.',
      });
    }
    if (paymentForCycle?.status === SubscriptionPaymentStatus.FAILED) {
      return this.retryPayment(userId, subscriptionId);
    }
    const link = await this.lockService.withDbLock(`early-pay:${cycle.id}`, () =>
      this.ensureEarlyPaymentLink(sub, cycle, userId),
    );
    if (!link) {
      throw new BadRequestException({
        code: SUBSCRIPTION_ERROR.CYCLE_IN_FLIGHT,
        message: 'Early payment is not available for this cycle right now',
      });
    }
    const refreshed = await this.subscriptionsRepository.findById(subscriptionId);
    return this.mapOwned(refreshed ?? sub, checkoutExtrasFromLink(link));
  }

  async adminPause(idOrRefId: string, actor: string, reason?: string) {
    const sub = await this.requireAdminSubscription(idOrRefId);
    return this.pause(sub.userId, sub.id, reason, actor);
  }

  async adminResume(idOrRefId: string, actor: string) {
    const sub = await this.requireAdminSubscription(idOrRefId);
    return this.resume(sub.userId, sub.id, actor);
  }

  async adminCancel(idOrRefId: string, actor: string, reason?: string) {
    const sub = await this.requireAdminSubscription(idOrRefId);
    return this.cancel(sub.userId, sub.id, reason);
  }

  async adminSkip(idOrRefId: string, actor: string) {
    const sub = await this.requireAdminSubscription(idOrRefId);
    return this.skipNext(sub.userId, sub.id, actor);
  }

  async adminRetryCycle(idOrRefId: string, cycleId: string, actor: string) {
    const sub = await this.requireAdminSubscription(idOrRefId);
    const cycle = await this.billingCycleService.findById(cycleId);
    if (!cycle || cycle.subscriptionId !== sub.id) {
      throw new NotFoundException('Billing cycle not found');
    }
    if (
      cycle.status === SubscriptionBillingCycleStatus.PAID ||
      cycle.status === SubscriptionBillingCycleStatus.PAID_ORDER_PENDING ||
      cycle.status === SubscriptionBillingCycleStatus.DEBIT_PENDING
    ) {
      throw new BadRequestException('Retry is not allowed for a paid or in-flight cycle');
    }
    await this.historyRepository.append({
      subscriptionId: sub.id,
      action: SubscriptionHistoryAction.ADMIN_RETRY,
      performedBy: actor,
      details: { cycleId },
    });
    await this.auditService.log({
      entityType: AuditEntityType.PRODUCT_SUBSCRIPTION,
      entityId: sub.id,
      entityRefId: sub.refId,
      action: 'retry-cycle',
      performedBy: actor,
      details: { cycleId },
    });
    await this.processSingleRenewal(sub.id, new Date());
    return this.getAdmin(sub.id);
  }

  async listAdmin(query: AdminProductSubscriptionQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { data, total } = await this.subscriptionsRepository.findPaginated({
      page,
      limit,
      search: query.search,
      status: query.status,
      userId: query.userId,
    });
    const items = await this.mapSubscriptionsWithRelations(data, { includeUser: true });
    return {
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async getAdmin(idOrRefId: string) {
    const sub = await this.subscriptionsRepository.findByIdOrRefId(idOrRefId);
    if (!sub) throw new NotFoundException('Subscription not found');
    const [mapped] = await this.mapSubscriptionsWithRelations([sub], { includeUser: true });
    const [cycles, payments, history, mandate] = await Promise.all([
      this.listCycles(sub.userId, sub.id),
      this.paymentsService.findBySubscriptionId(sub.id),
      this.listHistory(null, sub.id),
      this.mandateService.getForSubscription(sub.id),
    ]);
    return {
      ...mapped,
      mandate: mandate
        ? {
            id: mandate.id,
            status: mandate.status,
            provider: mandate.provider,
            maxAmount: mandate.maxAmount,
            currency: mandate.currency,
            validUntil: mandate.validUntil?.toISOString() ?? null,
          }
        : null,
      cycles,
      payments,
      history,
    };
  }

  private async mapSubscriptionsWithRelations(
    rows: Awaited<ReturnType<UserProductSubscriptionsRepository['findByUserId']>>,
    options?: {
      includeUser?: boolean;
      extras?: Parameters<typeof mapUserProductSubscriptionToResponse>[1];
    },
  ) {
    const [users, productEntities, variants] = await Promise.all([
      options?.includeUser
        ? this.relationLoader.loadUsersByIds(rows.map((r) => r.userId))
        : Promise.resolve(new Map()),
      this.relationLoader.loadProductEntitiesByIds(rows.map((r) => r.productId)),
      this.relationLoader.loadVariantsByIds(rows.map((r) => r.productVariantId)),
    ]);

    return Promise.all(
      rows.map(async (row) =>
        mapUserProductSubscriptionToResponse(row, {
          ...options?.extras,
          user: options?.includeUser ? users.get(row.userId) ?? null : null,
          product: await this.relationLoader.mapProductSummary(
            productEntities.get(row.productId),
            row.productVariantId,
          ),
          variant: variants.get(row.productVariantId) ?? null,
        }),
      ),
    );
  }

  private async applyPaymentPhase(items: IUserProductSubscription[]): Promise<void> {
    if (!items.length) return;
    const payments = await this.paymentsService.listStatusBySubscriptionIds(items.map((item) => item.id));
    const bySubscription = new Map<string, typeof payments>();
    for (const payment of payments) {
      const rows = bySubscription.get(payment.subscriptionId) ?? [];
      rows.push(payment);
      bySubscription.set(payment.subscriptionId, rows);
    }
    const phases = items.map((item) =>
      resolveSubscriptionPaymentPhase({
        status: item.status,
        autopayReady: item.autopayReady,
        firstOrderId: item.firstOrderId,
        payments: bySubscription.get(item.id) ?? [],
      }),
    );
    const missingOrderIds = items
      .filter((item, index) => phases[index].phase === 'PRODUCT_CONFIRMED' && !phases[index].orderId)
      .map((item) => item.id);
    const cycleOrders = missingOrderIds.length
      ? await this.billingCycleService.latestOrderIdsBySubscription(missingOrderIds)
      : new Map<string, string>();
    const orderIds = items.map(
      (item, index) => phases[index].orderId ?? cycleOrders.get(item.id) ?? null,
    );
    const orderNumbers = await this.ordersService.orderNumbersByIds(
      orderIds.filter((id): id is string => Boolean(id)),
    );
    items.forEach((item, index) => {
      const phase = phases[index];
      const orderId = orderIds[index];
      item.paymentPhase = phase.phase;
      item.confirmedOrderNumber = orderId ? orderNumbers.get(orderId) ?? null : null;
      if (item.allowedActions) {
        item.allowedActions.retryPayment = item.allowedActions.retryPayment && phase.retryAllowed;
      }
    });
  }

  private async reconcileAmbiguousCardCharge(payment: {
    id: string;
    subscriptionId: string;
    userId?: string;
    amount?: string | null;
    currency?: string | null;
    billingCycleRef?: string | null;
    gatewayOrderId?: string | null;
    gatewayPaymentId?: string | null;
    status: string;
  }): Promise<'settled' | 'blocked' | 'retryable' | 'unchanged'> {
    const mandate = await this.mandateService.getForSubscription(payment.subscriptionId);
    if (mandate?.consentEvidence?.cardAuthOnly !== true) return 'unchanged';
    const adapter = this.mandateService.adapter(SubscriptionMandateProvider.RAZORPAY);
    if (!adapter.isConfigured()) return 'blocked';
    const productOrder = this.cardProductOrderId(payment, mandate);
    if (productOrder) return this.reconcileCardProductOrder(payment, mandate, productOrder);
    if (!('lookupChargeByReceipt' in adapter) || !adapter.lookupChargeByReceipt) return 'blocked';
    const found = await adapter.lookupChargeByReceipt(`card-${payment.id}`.slice(0, 40));
    if (found.outcome === 'unknown') return 'blocked';
    if (found.outcome === 'absent') {
      await this.paymentsService.markFailed(
        payment.id,
        'Razorpay did not create a product charge for this payment',
        'payment-reconcile',
      );
      return 'retryable';
    }
    const orderId = found.snapshot.gatewayOrderId;
    if (!orderId || orderId === mandate.authorizationOrderId) return 'blocked';
    const productPaymentId = found.snapshot.gatewayPaymentId ?? null;
    await this.paymentsService.recordProviderCharge(payment.id, {
      gatewayOrderId: orderId,
      gatewayPaymentId: productPaymentId,
      paymentGateway: SubscriptionMandateProvider.RAZORPAY,
      pending: true,
      actor: 'payment-reconcile',
    });
    return this.reconcileCardProductOrder(
      { ...payment, gatewayPaymentId: productPaymentId },
      mandate,
      orderId,
    );
  }

  private cardProductOrderId(
    payment: { gatewayOrderId?: string | null },
    mandate: SubscriptionMandateEntity,
  ): string | null {
    const stored =
      payment.gatewayOrderId && payment.gatewayOrderId !== mandate.authorizationOrderId
        ? payment.gatewayOrderId
        : null;
    const evidence = mandate.consentEvidence?.productChargeOrderId;
    const saved = typeof evidence === 'string' && evidence && evidence !== mandate.authorizationOrderId ? evidence : null;
    return stored || saved;
  }

  private async reconcileCardProductOrder(
    payment: {
      id: string;
      subscriptionId: string;
      userId?: string;
      amount?: string | null;
      currency?: string | null;
      billingCycleRef?: string | null;
      gatewayPaymentId?: string | null;
    },
    mandate: SubscriptionMandateEntity,
    orderId: string,
  ): Promise<'settled' | 'blocked' | 'retryable'> {
    const listed = await this.readCardOrder(orderId);
    if (listed.outcome === 'unknown') return 'blocked';
    if (listed.outcome === 'found') return this.applyCardProductSnapshot(payment, orderId, listed.snapshot);
    if (payment.gatewayPaymentId || mandate.consentEvidence?.productEmptyListDebitAt) return 'blocked';
    return this.resumeCardDebitOnExistingOrder(payment, mandate, orderId);
  }

  private async readCardOrder(orderId: string): Promise<
    | { outcome: 'unknown' }
    | { outcome: 'absent' }
    | { outcome: 'found'; snapshot: { state: string; gatewayOrderId?: string | null; gatewayPaymentId?: string | null; amount?: string | null; currency?: string | null; failureReason?: string | null } }
  > {
    const adapter = this.mandateService.adapter(SubscriptionMandateProvider.RAZORPAY);
    if (!adapter.isConfigured() || !('listOrderCharge' in adapter) || !adapter.listOrderCharge) {
      return { outcome: 'unknown' };
    }
    return adapter.listOrderCharge(orderId);
  }

  private async applyCardProductSnapshot(
    payment: {
      id: string;
      amount?: string | null;
      currency?: string | null;
      gatewayPaymentId?: string | null;
    },
    orderId: string,
    snapshot: {
      state: string;
      gatewayOrderId?: string | null;
      gatewayPaymentId?: string | null;
      amount?: string | null;
      currency?: string | null;
      failureReason?: string | null;
    },
  ): Promise<'settled' | 'blocked' | 'retryable'> {
    if (this.cardProductCaptured(payment.amount, payment.currency, snapshot)) {
      await this.handlePaymentSuccess({
        paymentId: payment.id,
        gatewayOrderId: snapshot.gatewayOrderId ?? orderId,
        gatewayPaymentId: snapshot.gatewayPaymentId ?? payment.gatewayPaymentId ?? undefined,
        actor: 'payment-reconcile',
      });
      return 'settled';
    }
    if (snapshot.state === 'failed' && snapshot.gatewayPaymentId) {
      await this.paymentsService.markFailed(
        payment.id,
        snapshot.failureReason ?? 'Razorpay product charge failed',
        'payment-reconcile',
      );
      return 'retryable';
    }
    return 'blocked';
  }

  /**
   * The product order exists and Razorpay confirmed it has no payment.
   * One create/recurring is sent on that order. A second pass does not send another.
   */
  private async resumeCardDebitOnExistingOrder(
    payment: {
      id: string;
      subscriptionId: string;
      userId?: string;
      amount?: string | null;
      currency?: string | null;
      billingCycleRef?: string | null;
      gatewayPaymentId?: string | null;
    },
    mandate: SubscriptionMandateEntity,
    orderId: string,
  ): Promise<'settled' | 'blocked' | 'retryable'> {
    return this.lockService.withDbLock(`product-charge:${payment.id}`, async () => {
      const listed = await this.readCardOrder(orderId);
      if (listed.outcome === 'unknown') return 'blocked';
      if (listed.outcome === 'found') return this.applyCardProductSnapshot(payment, orderId, listed.snapshot);
      const currentMandate = (await this.mandateService.getForSubscription(payment.subscriptionId)) ?? mandate;
      if (payment.gatewayPaymentId || currentMandate.consentEvidence?.productEmptyListDebitAt) return 'blocked';
      const adapter = this.mandateService.adapter(SubscriptionMandateProvider.RAZORPAY);
      if (!('submitRecurringDebit' in adapter) || !adapter.submitRecurringDebit) return 'blocked';
      if (!currentMandate.gatewayCustomerId || !currentMandate.gatewayMandateId || !payment.userId || !payment.amount) {
        return 'blocked';
      }
      const user = await this.usersRepository.findById(payment.userId);
      if (!user?.mobileNumber) return 'blocked';
      const claimed = await this.mandateService.claimCardEmptyListDebit(currentMandate.id, 'payment-reconcile');
      if (!claimed) return 'blocked';
      await this.mandateService.markCardDebitSubmitted(currentMandate.id, 'payment-reconcile');
      const result = await adapter.submitRecurringDebit({
        gatewayCustomerId: currentMandate.gatewayCustomerId,
        gatewayMandateId: currentMandate.gatewayMandateId,
        gatewaySubscriptionId: currentMandate.gatewaySubscriptionId,
        amount: payment.amount,
        currency: payment.currency ?? 'INR',
        receipt: `card-${payment.id}`.slice(0, 40),
        idempotencyKey: `card-${payment.id}`.slice(0, 40),
        customer: { email: user.email ?? null, phone: user.mobileNumber },
        notes: buildSubscriptionGatewayNotes({
          paymentPurpose: SUBSCRIPTION_PAYMENT_PURPOSE.PRODUCT_SUBSCRIPTION,
          billingCycleRef: payment.billingCycleRef ?? '',
          subscriptionId: payment.subscriptionId,
          subscriptionPaymentId: payment.id,
          userId: payment.userId,
        }),
        gatewayOrderId: orderId,
      });
      if (result.gatewayOrderId || result.gatewayPaymentId) {
        await this.paymentsService.recordProviderCharge(payment.id, {
          gatewayOrderId: result.gatewayOrderId ?? orderId,
          gatewayPaymentId: result.gatewayPaymentId,
          paymentGateway: SubscriptionMandateProvider.RAZORPAY,
          pending: Boolean(result.pending || !result.accepted),
          actor: 'payment-reconcile',
        });
      }
      if (/requested URL was not found/i.test(result.failureReason ?? '') && !result.gatewayPaymentId) {
        await this.mandateService.releaseCardEmptyListDebitForUnavailable(currentMandate.id, 'payment-reconcile');
        return 'blocked';
      }
      if (result.pending || !result.gatewayPaymentId) return 'blocked';
      if (!result.accepted) {
        await this.paymentsService.markFailed(
          payment.id,
          result.failureReason ?? 'Razorpay product charge failed',
          'payment-reconcile',
        );
        return 'retryable';
      }
      const after = await this.readCardOrder(orderId);
      if (after.outcome !== 'found') return 'blocked';
      return this.applyCardProductSnapshot(
        { ...payment, gatewayPaymentId: result.gatewayPaymentId },
        orderId,
        after.snapshot,
      );
    });
  }

  private async blockRetryWhileGatewayChargeIsOpen(
    payments: Array<{
      status: SubscriptionPaymentStatus | string;
      amount?: string | null;
      currency?: string | null;
      gatewayOrderId?: string | null;
      gatewayPaymentId?: string | null;
      paymentGateway?: string | null;
      id: string;
    }>,
    subscriptionId: string,
  ): Promise<'clear' | 'settled' | 'in_flight'> {
    const mandate = await this.mandateService.getForSubscription(subscriptionId);
    const open = payments.find(
      (payment) =>
        payment.gatewayOrderId?.startsWith('order_') &&
        payment.status !== SubscriptionPaymentStatus.PAID &&
        payment.status !== SubscriptionPaymentStatus.FAILED &&
        (payment.paymentGateway ?? '').toUpperCase() === 'RAZORPAY',
    );
    if (!open?.gatewayOrderId) return 'clear';
    if (mandate?.authorizationOrderId && open.gatewayOrderId === mandate.authorizationOrderId) return 'clear';
    const adapter = this.mandateService.adapter(SubscriptionMandateProvider.RAZORPAY);
    if (!adapter.isConfigured()) return 'in_flight';
    const snapshot = await adapter.fetchChargeStatus({
      gatewayOrderId: open.gatewayOrderId,
      gatewayPaymentId: open.gatewayPaymentId,
    });
    if (snapshot.state === 'failed' || (snapshot.state === 'unknown' && !open.gatewayPaymentId)) {
      return 'clear';
    }
    const card = mandate?.consentEvidence?.cardAuthOnly === true;
    const paysProduct = card
      ? this.cardProductCaptured(open.amount, open.currency, snapshot)
      : this.snapshotPaysProductAmount(open.amount, snapshot) || snapshot.state === 'captured';
    if (paysProduct) {
      await this.handlePaymentSuccess({
        paymentId: open.id,
        gatewayOrderId: snapshot.gatewayOrderId ?? open.gatewayOrderId,
        gatewayPaymentId: snapshot.gatewayPaymentId ?? open.gatewayPaymentId ?? undefined,
        actor: 'retry-reconcile',
      });
      const after = await this.paymentsService.findById(open.id);
      if (after?.status === SubscriptionPaymentStatus.PAID) return 'settled';
    }
    return 'in_flight';
  }

  private snapshotPaysProductAmount(
    expectedAmount: string | null | undefined,
    snapshot: { state: string; amount?: string | null },
  ): boolean {
    if (snapshot.state !== 'captured') return false;
    if (expectedAmount == null || expectedAmount === '' || snapshot.amount == null || snapshot.amount === '') {
      return true;
    }
    const expected = Number(expectedAmount);
    const actual = Number(snapshot.amount);
    return Number.isFinite(expected) && Number.isFinite(actual) && Math.abs(expected - actual) < 0.009;
  }

  /** Card product capture must match the subscription amount. A missing amount is not a match. */
  private cardProductCaptured(
    expectedAmount: string | null | undefined,
    expectedCurrency: string | null | undefined,
    snapshot: { state: string; amount?: string | null; currency?: string | null },
  ): boolean {
    if (snapshot.state !== 'captured') return false;
    if (expectedAmount == null || expectedAmount === '' || snapshot.amount == null || snapshot.amount === '') {
      return false;
    }
    const currency = (expectedCurrency || 'INR').toUpperCase();
    if (snapshot.currency && snapshot.currency.toUpperCase() !== currency) return false;
    const expected = Number(expectedAmount);
    const actual = Number(snapshot.amount);
    return Number.isFinite(expected) && Number.isFinite(actual) && Math.abs(expected - actual) < 0.009;
  }

  /**
   * Cashfree subscription ACTIVE is only a mandate status. The product payment
   * is recorded after a successful subscription payment whose amount matches.
   */
  async settleCashfreeSubscriptionPayment(params: {
    paymentId?: string;
    gatewayOrderId?: string;
    gatewayPaymentId?: string;
    gatewaySubscriptionId?: string;
    actor: string;
  }): Promise<boolean> {
    const payment = params.paymentId
      ? await this.paymentsService.findById(params.paymentId)
      : params.gatewayOrderId
        ? await this.paymentsService.findByGatewayOrderId(params.gatewayOrderId)
        : null;
    if (!payment) {
      this.logger.warn(
        {
          event: AUTOPAY_TRACE,
          phase: 'cashfree_settle_skipped',
          paymentId: params.paymentId ?? null,
          gatewayOrderId: params.gatewayOrderId ?? null,
          gatewaySubscriptionId: params.gatewaySubscriptionId ?? null,
          nowIst: formatIstDate(new Date()),
        },
        `${AUTOPAY_TRACE} Cashfree settlement skipped because the subscription payment row was not found`,
      );
      return false;
    }
    if (payment.status === SubscriptionPaymentStatus.PAID) {
      this.logger.log(
        { paymentId: payment.id, subscriptionId: payment.subscriptionId, status: payment.status },
        'Cashfree settlement skipped because the subscription payment is already paid',
      );
      return true;
    }
    const mandate = await this.mandateService.getForSubscription(payment.subscriptionId);
    const storedOrder = params.gatewayOrderId ?? payment.gatewayOrderId;
    const chargeOrderId =
      storedOrder &&
      storedOrder !== mandate?.authorizationOrderId &&
      storedOrder !== params.gatewaySubscriptionId &&
      storedOrder !== mandate?.gatewaySubscriptionId
        ? storedOrder
        : null;
    const adapter = this.mandateService.adapter(SubscriptionMandateProvider.CASHFREE);
    if (!adapter.isConfigured()) {
      this.logger.warn(
        { paymentId: payment.id, subscriptionId: payment.subscriptionId },
        'Cashfree settlement skipped because Cashfree credentials are missing',
      );
      return false;
    }
    const gatewaySubscriptionId = resolveCashfreeMerchantSubscriptionId(
      mandate?.authorizationOrderId,
      params.gatewaySubscriptionId,
      mandate?.gatewaySubscriptionId,
    );
    const snapshot = await adapter.fetchChargeStatus({
      gatewayOrderId: chargeOrderId,
      gatewayPaymentId: params.gatewayPaymentId ?? payment.gatewayPaymentId,
      gatewaySubscriptionId,
      expectedAmount: payment.amount,
      expectedCurrency: payment.currency,
      matchSingleCaptured:
        !chargeOrderId &&
        !params.gatewayPaymentId &&
        !payment.gatewayPaymentId &&
        payment.attemptKind === SubscriptionPaymentAttemptKind.FIRST_ORDER,
    });
    if (!this.cashfreeCapturedPaymentMatches(payment, snapshot)) {
      this.logger.warn(
        {
          event: AUTOPAY_TRACE,
          phase: 'cashfree_settle_mismatch',
          paymentId: payment.id,
          subscriptionId: payment.subscriptionId,
          attemptKind: payment.attemptKind ?? null,
          expectedAmount: payment.amount,
          expectedCurrency: payment.currency ?? null,
          snapshotState: snapshot.state,
          snapshotAmount: snapshot.amount ?? null,
          snapshotCurrency: snapshot.currency ?? null,
          snapshotPaymentType: snapshot.paymentType ?? null,
          gatewaySubscriptionId: gatewaySubscriptionId ?? null,
          chargeOrderId,
          nowIst: formatIstDate(new Date()),
        },
        `${AUTOPAY_TRACE} Cashfree settlement skipped because the captured payment does not match the subscription`,
      );
      return false;
    }
    return this.lockService.withDbLock(`settle:${payment.id}`, async () => {
      const current = await this.paymentsService.findById(payment.id);
      if (!current) return false;
      if (current.status === SubscriptionPaymentStatus.PAID) {
        this.logger.log(
          { paymentId: current.id, subscriptionId: current.subscriptionId },
          'Cashfree settlement found the payment already paid, so a second order was not created',
        );
        return true;
      }
      if (!this.cashfreeCapturedPaymentMatches(current, snapshot)) return false;
      this.logger.log(
        {
          event: AUTOPAY_TRACE,
          phase: 'cashfree_settle_matched',
          paymentId: current.id,
          subscriptionId: current.subscriptionId,
          attemptKind: current.attemptKind ?? null,
          snapshotAmount: snapshot.amount,
          snapshotCurrency: snapshot.currency ?? null,
          snapshotState: snapshot.state,
          snapshotPaymentType: snapshot.paymentType ?? null,
          nowIst: formatIstDate(new Date()),
        },
        `${AUTOPAY_TRACE} Cashfree product payment matched the subscription amount and currency`,
      );
      await this.handlePaymentSuccess({
        paymentId: current.id,
        gatewayPaymentId: snapshot.gatewayPaymentId ?? params.gatewayPaymentId ?? undefined,
        actor: params.actor,
      });
      const after = await this.paymentsService.findById(current.id);
      return after?.status === SubscriptionPaymentStatus.PAID;
    });
  }

  /**
   * A Cashfree capture settles only when amount and payment_currency are both present and match.
   * A missing currency is not treated as INR.
   */
  private cashfreeCapturedPaymentMatches(
    payment: {
      amount?: string | null;
      currency?: string | null;
      attemptKind?: SubscriptionPaymentAttemptKind | null;
    },
    snapshot: { state: string; amount?: string | null; currency?: string | null; paymentType?: string | null },
  ): boolean {
    if (snapshot.state !== 'captured') return false;
    if (
      (snapshot.paymentType ?? '').toUpperCase() === 'AUTH' &&
      payment.attemptKind !== SubscriptionPaymentAttemptKind.FIRST_ORDER
    ) {
      return false;
    }
    if (payment.amount == null || payment.amount === '' || snapshot.amount == null || snapshot.amount === '') {
      return false;
    }
    const expectedCurrency = payment.currency?.trim();
    const actualCurrency = snapshot.currency?.trim();
    if (!expectedCurrency || !actualCurrency) return false;
    if (expectedCurrency.toUpperCase() !== actualCurrency.toUpperCase()) return false;
    const expected = Number(payment.amount);
    const actual = Number(snapshot.amount);
    return Number.isFinite(expected) && Number.isFinite(actual) && Math.abs(expected - actual) < 0.009;
  }

  async isRazorpayChargeCaptured(params: {
    gatewayOrderId?: string | null;
    gatewayPaymentId?: string | null;
    expectedAmount?: string | null;
  }): Promise<boolean> {
    const adapter = this.mandateService.adapter(SubscriptionMandateProvider.RAZORPAY);
    if (!adapter.isConfigured()) return false;
    const snapshot = await adapter.fetchChargeStatus(params);
    return this.snapshotPaysProductAmount(params.expectedAmount, snapshot);
  }

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
      this.logger.warn(params, 'Product subscription payment not found for webhook');
      return;
    }

    const cardAction = await this.mandateService.cardAuthorizationAction(params.gatewayOrderId);
    if (cardAction.action === 'wait') {
      this.logger.log(
        { paymentId: payment.id, gatewayOrderId: params.gatewayOrderId ?? null },
        'Card authorization is waiting for the product charge, so no order was created',
      );
      return;
    }
    if (cardAction.action === 'charge') {
      const charged = await this.collectProductAfterCardAuthorization(payment, cardAction.mandate.id, params);
      if (!charged) {
        this.logger.warn(
          { paymentId: payment.id, subscriptionId: payment.subscriptionId },
          'Card product charge did not finish, so no order was created',
        );
        return;
      }
      params = {
        ...params,
        gatewayOrderId: charged.gatewayOrderId ?? params.gatewayOrderId,
        gatewayPaymentId: charged.gatewayPaymentId ?? params.gatewayPaymentId,
      };
    }

    const { payment: paidPayment, newlyPaid } = await this.paymentsService.markPaidIdempotent(
      payment.id,
      { gatewayPaymentId: params.gatewayPaymentId, actor: params.actor },
    );
    if (!newlyPaid) {
      this.logger.log(
        { paymentId: payment.id, subscriptionId: payment.subscriptionId },
        'Subscription payment was already recorded, so a second order was not created',
      );
      await this.confirmFirstChargeMandate(payment.gatewayOrderId, params.gatewayPaymentId, params.actor);
      return;
    }

    let sub = await this.subscriptionsRepository.findById(paidPayment.subscriptionId);
    if (!sub) {
      sub = await this.subscriptionsRepository.findByIdIncludingDeleted(paidPayment.subscriptionId);
      if (sub?.deletedAt) {
        await this.subscriptionsRepository.restoreById(sub.id);
      }
    }
    if (!sub) {
      this.logger.error({ paymentId: paidPayment.id }, 'Subscription missing after payment');
      return;
    }

    const now = new Date();
    const timezone = sub.timezone || 'Asia/Kolkata';
    const keepStatus =
      sub.status === ProductSubscriptionStatus.CANCELLED ||
      sub.status === ProductSubscriptionStatus.EXPIRED ||
      sub.status === ProductSubscriptionStatus.PAUSED;
    if (!keepStatus) {
      const nextBilling = getNextProductBillingDate(
        now,
        sub.frequency,
        timezone,
        sub.scheduleAnchorDay,
      );
      const deliveryLead = sub.config?.deliveryLeadDays ?? 2;
      await this.subscriptionsRepository.updateById(sub.id, {
        status: ProductSubscriptionStatus.ACTIVE,
        startDate: sub.startDate ?? now,
        nextBillingDate: nextBilling,
        nextDeliveryDate: getEstimatedDeliveryDate(nextBilling, deliveryLead),
        billingCycleSequence: (sub.billingCycleSequence ?? 0) + 1,
        paymentGateway: paidPayment.paymentGateway ?? sub.paymentGateway,
        updatedBy: params.actor ?? 'webhook',
      });
    }

    if (paidPayment.billingCycleId) {
      await this.billingCycleService.updateById(paidPayment.billingCycleId, {
        status: SubscriptionBillingCycleStatus.PAID_ORDER_PENDING,
        paymentId: paidPayment.id,
        updatedBy: params.actor ?? 'webhook',
      });
    }

    await this.historyRepository.append({
      subscriptionId: sub.id,
      action: SubscriptionHistoryAction.PAYMENT_SUCCEEDED,
      performedBy: params.actor ?? 'webhook',
      details: { paymentId: paidPayment.id, billingCycleRef: paidPayment.billingCycleRef },
    });

    const order = await this.tryCreateOrderForPaidCycle(sub, paidPayment, params.actor);
    if (!order) {
      this.logger.warn(
        { subscriptionId: sub.id, paymentId: paidPayment.id, status: sub.status },
        'Subscription payment was recorded, but the Cureka order was not created',
      );
    } else {
      this.logger.log(
        { subscriptionId: sub.id, paymentId: paidPayment.id, orderId: order.id },
        'Subscription order created from the captured payment',
      );
    }
    if (order) {
      if (!sub.firstOrderId) {
        await this.subscriptionsRepository.updateById(sub.id, {
          firstOrderId: order.id,
          updatedBy: params.actor ?? 'webhook',
        });
      }
      await this.paymentsService.attachOrderId(paidPayment.id, order.id, params.actor ?? 'webhook');
      if (paidPayment.billingCycleId) {
        await this.billingCycleService.updateById(paidPayment.billingCycleId, {
          status: SubscriptionBillingCycleStatus.PAID,
          orderId: order.id,
          updatedBy: params.actor ?? 'webhook',
        });
      }
    }

    this.notificationsService.notifyActivated({
      userId: sub.userId,
      kind: 'product_subscription',
      refId: sub.refId,
    });
    await this.confirmFirstChargeMandate(
      paidPayment.gatewayOrderId,
      params.gatewayPaymentId ?? paidPayment.gatewayPaymentId,
      params.actor,
    );
  }

  async resumeCardProductCharge(gatewayMandateId?: string | null): Promise<void> {
    if (!gatewayMandateId) return;
    const mandate = await this.mandateService.findByGatewayMandateId(gatewayMandateId);
    const paymentId = mandate?.consentEvidence?.subscriptionPaymentId;
    if (!mandate || mandate.consentEvidence?.cardAuthOnly !== true || typeof paymentId !== 'string' || !paymentId) {
      return;
    }
    const payment = await this.paymentsService.findById(paymentId);
    if (!payment || payment.status === SubscriptionPaymentStatus.PAID || payment.status === SubscriptionPaymentStatus.FAILED) {
      return;
    }
    const subscription = await this.subscriptionsRepository.findById(payment.subscriptionId);
    if (
      subscription?.status === ProductSubscriptionStatus.CANCELLED ||
      subscription?.status === ProductSubscriptionStatus.EXPIRED
    ) {
      return;
    }
    if (
      payment.status === SubscriptionPaymentStatus.RECONCILING ||
      mandate.consentEvidence?.productChargeOrderId
    ) {
      await this.reconcileAmbiguousCardCharge(payment);
      return;
    }
    await this.collectCardProductAfterTokenConfirmed(gatewayMandateId);
  }

  async collectCardProductAfterTokenConfirmed(gatewayMandateId?: string | null): Promise<void> {
    if (!gatewayMandateId) return;
    const mandate = await this.mandateService.findByGatewayMandateId(gatewayMandateId);
    const paymentId = mandate?.consentEvidence?.subscriptionPaymentId;
    if (!mandate?.authorizationOrderId || typeof paymentId !== 'string' || !paymentId) return;
    if (mandate.consentEvidence?.cardAuthOnly !== true || mandate.consentEvidence?.productChargeOrderId) return;
    const payment = await this.paymentsService.findById(paymentId);
    if (
      !payment ||
      payment.status === SubscriptionPaymentStatus.PAID ||
      payment.status === SubscriptionPaymentStatus.FAILED ||
      payment.status === SubscriptionPaymentStatus.RECONCILING
    ) {
      return;
    }
    const owned = await this.subscriptionsRepository.findById(payment.subscriptionId);
    if (
      owned?.status === ProductSubscriptionStatus.CANCELLED ||
      owned?.status === ProductSubscriptionStatus.EXPIRED
    ) {
      return;
    }
    const charged = await this.collectProductAfterCardAuthorization(payment, mandate.id, {
      gatewayOrderId: mandate.authorizationOrderId,
      gatewayPaymentId: mandate.authorizationPaymentId,
      actor: 'razorpay-webhook',
    });
    if (!charged) return;
    await this.handlePaymentSuccess({
      paymentId: payment.id,
      gatewayOrderId: charged.gatewayOrderId,
      gatewayPaymentId: charged.gatewayPaymentId ?? undefined,
      actor: 'razorpay-webhook',
    });
  }

  private async collectProductAfterCardAuthorization(
    payment: {
      id: string;
      amount: string;
      userId: string;
      subscriptionId: string;
      billingCycleRef: string;
    },
    mandateId: string,
    params: { gatewayOrderId?: string | null; gatewayPaymentId?: string | null; actor?: string },
  ): Promise<{ gatewayOrderId: string; gatewayPaymentId?: string | null } | null> {
    return this.lockService.withDbLock(`product-charge:${payment.id}`, async () => {
      const current = await this.paymentsService.findById(payment.id);
      if (
        !current ||
        current.status === SubscriptionPaymentStatus.PAID ||
        current.status === SubscriptionPaymentStatus.FAILED ||
        current.status === SubscriptionPaymentStatus.RECONCILING
      ) {
        return null;
      }
      const actor = params.actor ?? 'webhook';
      const claimed = await this.paymentsService.claimChargeInitiation(payment.id, actor);
      if (!claimed) return null;
      await this.confirmFirstChargeMandate(params.gatewayOrderId, params.gatewayPaymentId, actor);
      const user = await this.usersRepository.findById(payment.userId);
      const result = await this.mandateService.chargeCardProduct({
        mandateId,
        amount: payment.amount,
        customer: { email: user?.email ?? null, phone: user?.mobileNumber ?? '' },
        notes: buildSubscriptionGatewayNotes({
          paymentPurpose: SUBSCRIPTION_PAYMENT_PURPOSE.PRODUCT_SUBSCRIPTION,
          billingCycleRef: payment.billingCycleRef,
          subscriptionId: payment.subscriptionId,
          subscriptionPaymentId: payment.id,
          userId: payment.userId,
        }),
        actor,
        receipt: `card-${payment.id}`.slice(0, 40),
      });
      if (result.gatewayOrderId) {
        await this.paymentsService.recordProviderCharge(payment.id, {
          gatewayOrderId: result.gatewayOrderId,
          gatewayPaymentId: result.gatewayPaymentId,
          paymentGateway: SubscriptionMandateProvider.RAZORPAY,
          pending: result.pending,
          actor,
        });
        if (result.pending) return null;
        return {
          gatewayOrderId: result.gatewayOrderId,
          gatewayPaymentId: result.gatewayPaymentId,
        };
      }
      if (result.pending) {
        if (result.accepted) {
          this.logger.warn(
            { paymentId: payment.id, reason: result.failureReason },
            'Card product charge result is unknown, so no second charge will be started',
          );
          return null;
        }
        await this.paymentsService.releaseChargeInitiation(payment.id, actor);
        return null;
      }
      await this.paymentsService.markFailed(
        payment.id,
        result.failureReason ?? 'Razorpay did not start the product charge',
        actor,
      );
      this.logger.warn(
        { paymentId: payment.id, reason: result.failureReason },
        'Card AutoPay did not charge the product amount',
      );
      return null;
    });
  }

  private async confirmFirstChargeMandate(
    gatewayOrderId: string | null | undefined,
    gatewayPaymentId: string | null | undefined,
    actor?: string,
  ): Promise<void> {
    try {
      await this.mandateService.confirmFromAuthorizationPayment({
        gatewayOrderId,
        gatewayPaymentId,
        actor: actor ?? 'webhook',
      });
    } catch (error) {
      this.logger.warn(
        {
          gatewayOrderId,
          error: error instanceof Error ? error.message : String(error),
        },
        'AutoPay mandate was not confirmed from the first payment',
      );
    }
  }

  private async settleReconcilingPayments(subscriptionId?: string): Promise<void> {
    const reconciling = await this.paymentsService.listReconciling(subscriptionId);
    const cashfreeOpen = await this.paymentsService.listCashfreeAwaitingSettlement(subscriptionId);
    const seen = new Set(reconciling.map((payment) => payment.id));
    const payments = [
      ...reconciling,
      ...cashfreeOpen.filter((payment) => !seen.has(payment.id)),
    ];
    for (const payment of payments) {
      const gateway = (payment.paymentGateway ?? '').trim().toUpperCase();
      if (!gateway || (gateway !== 'RAZORPAY' && gateway !== 'CASHFREE')) {
        this.logger.warn(
          { paymentId: payment.id, paymentGateway: payment.paymentGateway ?? null },
          'Reconciling payment has no known gateway, so it was left unchanged',
        );
        continue;
      }
      if (gateway === 'CASHFREE') {
        try {
          await this.settleCashfreeSubscriptionPayment({
            paymentId: payment.id,
            gatewayOrderId: payment.gatewayOrderId ?? undefined,
            gatewayPaymentId: payment.gatewayPaymentId ?? undefined,
            actor: 'payment-reconcile',
          });
        } catch (error) {
          this.logger.warn(
            {
              paymentId: payment.id,
              error: error instanceof Error ? error.message : String(error),
            },
            'Reconciling Cashfree payment could not be settled',
          );
        }
        continue;
      }
      try {
        const subscription = await this.subscriptionsRepository.findById(payment.subscriptionId);
        if (
          subscription?.status === ProductSubscriptionStatus.CANCELLED ||
          subscription?.status === ProductSubscriptionStatus.EXPIRED
        ) {
          continue;
        }
        const mandate = await this.mandateService.getForSubscription(payment.subscriptionId);
        const card = mandate?.consentEvidence?.cardAuthOnly === true;
        const stored = payment.gatewayOrderId ?? null;
        const registrationOrder = Boolean(
          stored && mandate?.authorizationOrderId && stored === mandate.authorizationOrderId,
        );
        if (!card && stored?.startsWith('order_') && !registrationOrder) {
          const captured = await this.isRazorpayChargeCaptured({
            gatewayOrderId: payment.gatewayOrderId,
            gatewayPaymentId: payment.gatewayPaymentId,
            expectedAmount: payment.amount,
          });
          if (captured) {
            await this.handlePaymentSuccess({
              paymentId: payment.id,
              gatewayOrderId: stored,
              gatewayPaymentId: payment.gatewayPaymentId ?? undefined,
              actor: 'payment-reconcile',
            });
            continue;
          }
        }
        await this.reconcileAmbiguousCardCharge(payment);
      } catch (error) {
        this.logger.warn(
          {
            paymentId: payment.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Reconciling subscription payment could not be settled',
        );
      }
    }
  }

  async processRenewals(asOfDate = new Date()): Promise<number> {
    const lock = await this.lockService.acquire('product-renewal-run', 10 * 60 * 1000);
    if (!lock) {
      this.logger.warn('Skipping product subscription renewal — another worker holds the lock');
      return 0;
    }
    try {
      await this.finalizePaidCycles(asOfDate);
      await this.settleReconcilingPayments();
      await this.chargePendingCashfreeFirstOrders(asOfDate);
      await this.scheduleUpcomingUpiDebits(asOfDate);
      if (isCashfreeAdvanceChargeEnabled(this.nestConfig)) {
        await this.scheduleUpcomingCashfreeDebits(asOfDate);
      }
      const due = await this.subscriptionsRepository.findDueForRenewal(
        [
          ProductSubscriptionStatus.ACTIVE,
          ProductSubscriptionStatus.RENEWAL_PAYMENT_PENDING,
          ProductSubscriptionStatus.PAST_DUE,
        ],
        asOfDate,
      );

      let processed = 0;
      for (const sub of due) {
        const cycleLock = await this.runIsolatedSubscriptionPass(
          sub.id,
          'due-renewal',
          () => this.processSingleRenewal(sub.id, asOfDate),
        );
        if (cycleLock) processed += 1;
      }
      return processed;
    } finally {
      await this.lockService.release('product-renewal-run');
    }
  }

  /**
   * Live UPI cannot be debited when a short cycle becomes due: Razorpay needs
   * about 25 hours of notice. A 27-hour subscription sends that notice as soon
   * as the next charge is known, with the debit time set to that charge.
   */
  private async scheduleUpcomingUpiDebits(asOfDate: Date): Promise<void> {
    const upcoming = await this.subscriptionsRepository.findUpcomingByFrequency(
      ProductSubscriptionFrequency.HOURS_27,
      [ProductSubscriptionStatus.ACTIVE],
      asOfDate,
    );
    for (const sub of upcoming) {
      await this.runIsolatedSubscriptionPass(sub.id, 'upi-preschedule', () =>
        this.presentUpcomingUpiDebit(sub.id, asOfDate),
      );
    }
  }

  private async presentUpcomingUpiDebit(subscriptionId: string, asOfDate: Date): Promise<void> {
    const sub = await this.subscriptionsRepository.findById(subscriptionId);
    if (!sub?.nextBillingDate || sub.frequency !== ProductSubscriptionFrequency.HOURS_27) return;
    if (sub.status !== ProductSubscriptionStatus.ACTIVE) return;
    if (sub.nextBillingDate.getTime() <= asOfDate.getTime()) return;

    const openCycles = await this.billingCycleService.findBySubscriptionId(sub.id);
    if (
      openCycles.some(
        (cycle) =>
          cycle.status === SubscriptionBillingCycleStatus.DEBIT_PENDING ||
          cycle.status === SubscriptionBillingCycleStatus.NOTIFICATION_SENT,
      )
    ) {
      return;
    }

    const billingCycleRef = buildBillingCycleRef(sub.nextBillingDate, sub.frequency);
    const existing = openCycles.find((cycle) => cycle.billingCycleRef === billingCycleRef);
    const debitAt = razorpayUpiDebitAt({
      now: asOfDate,
      keyId: this.nestConfig.get<string>('RAZORPAY_KEY_ID') ?? '',
      allowShortWindow:
        isSubscriptionTestTenuresEnabled(this.nestConfig) && TEST_PRODUCT_FREQUENCIES.has(sub.frequency),
      scheduledAt: sub.nextBillingDate,
    });
    const canNotifyAtSchedule = debitAt.getTime() === sub.nextBillingDate.getTime();
    if (existing?.status === SubscriptionBillingCycleStatus.FAILED) {
      const restored = await this.recoverFailedUpiCycle(sub, existing, asOfDate, canNotifyAtSchedule);
      if (restored !== 'schedule') return;
    } else if (existing && existing.status !== SubscriptionBillingCycleStatus.SCHEDULED) {
      return;
    }

    const mandate = await this.mandateService.getForSubscription(sub.id);
    if (!mandate || !this.mandateService.canPresentAsAutopay(sub, mandate)) return;
    const mandateMethod = String(mandate.consentEvidence?.method ?? '');
    if (mandateMethod === 'card' || mandateMethod === 'emandate') return;
    if (this.mandateService.resolveChargeProvider(sub) !== SubscriptionMandateProvider.RAZORPAY) return;
    if (!canNotifyAtSchedule) return;

    let quote: SubscriptionRenewalQuote;
    try {
      quote = await this.quoteRenewal(sub);
    } catch (error) {
      this.logger.warn(
        { subscriptionId: sub.id, error: error instanceof Error ? error.message : String(error) },
        '27-hour UPI debit was not scheduled because pricing failed',
      );
      return;
    }
    const deliveryLead = sub.config?.deliveryLeadDays ?? 2;
    const cycle = await this.billingCycleService.getOrCreate({
      subscriptionId: sub.id,
      userId: sub.userId,
      billingCycleRef,
      sequence: (sub.billingCycleSequence ?? 0) + 1,
      chargeDate: sub.nextBillingDate,
      estimatedDeliveryDate: getEstimatedDeliveryDate(sub.nextBillingDate, deliveryLead),
      amount: quote.finalAmount,
      pricingSnapshot: buildRenewalPricingSnapshot(quote, { frequency: sub.frequency }),
      actor: 'scheduler',
    });
    const amount = isBillingCyclePricingLocked(cycle.status) ? cycle.amount : quote.finalAmount;
    if (!isAmountWithinMandateLimit(amount, mandate.maxAmount)) {
      await this.markMandateLimitExceeded(sub, cycle, amount, mandate.maxAmount);
      return;
    }
    if (
      cycle.status === SubscriptionBillingCycleStatus.PAID ||
      cycle.status === SubscriptionBillingCycleStatus.PAID_ORDER_PENDING ||
      cycle.status === SubscriptionBillingCycleStatus.SKIPPED ||
      cycle.status === SubscriptionBillingCycleStatus.DEBIT_PENDING
    ) {
      return;
    }

    await this.attemptAutopay(sub, cycle, mandate.id, amount, billingCycleRef, sub.nextBillingDate);
  }

  /**
   * Cashfree ON_DEMAND does not store next_schedule_date. Raise CHARGE before the
   * intended Kolkata billing date so UPI/card collection can land on that date.
   */
  private async scheduleUpcomingCashfreeDebits(asOfDate: Date): Promise<void> {
    const horizon = new Date(
      asOfDate.getTime() + CASHFREE_CHARGE_MAX_LEAD_DAYS * 24 * 60 * 60 * 1000,
    );
    const upcoming = await this.subscriptionsRepository.findUpcomingWithinWindow(
      [ProductSubscriptionStatus.ACTIVE],
      asOfDate,
      horizon,
    );
    for (const sub of upcoming) {
      await this.runIsolatedSubscriptionPass(sub.id, 'cashfree-preschedule', () =>
        this.presentUpcomingCashfreeDebit(sub.id, asOfDate),
      );
    }
  }

  private async presentUpcomingCashfreeDebit(subscriptionId: string, asOfDate: Date): Promise<void> {
    const sub = await this.subscriptionsRepository.findById(subscriptionId);
    if (!sub?.nextBillingDate) return;
    if (sub.status !== ProductSubscriptionStatus.ACTIVE) return;
    if (sub.nextBillingDate.getTime() <= asOfDate.getTime()) return;
    if (this.mandateService.resolveChargeProvider(sub) !== SubscriptionMandateProvider.CASHFREE) {
      return;
    }

    const openCycles = await this.billingCycleService.findBySubscriptionId(sub.id);
    if (
      openCycles.some(
        (cycle) =>
          cycle.status === SubscriptionBillingCycleStatus.DEBIT_PENDING ||
          cycle.status === SubscriptionBillingCycleStatus.NOTIFICATION_SENT,
      )
    ) {
      return;
    }

    const billingCycleRef = buildBillingCycleRef(sub.nextBillingDate, sub.frequency);
    const existing = openCycles.find((cycle) => cycle.billingCycleRef === billingCycleRef);
    if (
      existing &&
      existing.status !== SubscriptionBillingCycleStatus.SCHEDULED &&
      existing.status !== SubscriptionBillingCycleStatus.FAILED &&
      existing.status !== SubscriptionBillingCycleStatus.LINK_GENERATED
    ) {
      return;
    }

    const mandate = await this.mandateService.getForSubscription(sub.id);
    if (!mandate || !this.mandateService.canPresentAsAutopay(sub, mandate)) return;
    if (this.mandateService.resolveChargeProvider(sub) !== mandate.provider) return;

    const decision = resolveCashfreeChargeSchedule({
      intended: sub.nextBillingDate,
      now: asOfDate,
      method: String(mandate.consentEvidence?.method ?? ''),
    });
    if (decision.outcome === 'wait') {
      if (isHourlyAutopayTrace(asOfDate)) {
        this.logAutopayTrace('cashfree_charge_wait', {
          subscriptionId: sub.id,
          refId: sub.refId,
          frequency: sub.frequency,
          status: sub.status,
          nextBillingIst: formatIstDate(sub.nextBillingDate),
          nowIst: formatIstDate(asOfDate),
          method: String(mandate.consentEvidence?.method ?? ''),
          reason: decision.reason,
          merchantSubscriptionId: resolveCashfreeMerchantSubscriptionId(
            mandate.authorizationOrderId,
            mandate.gatewaySubscriptionId,
          ),
        });
      }
      return;
    }

    const deliveryLead = sub.config?.deliveryLeadDays ?? 2;
    let quote: SubscriptionRenewalQuote;
    try {
      quote = await this.quoteRenewal(sub);
    } catch (error) {
      this.logger.warn(
        {
          event: AUTOPAY_TRACE,
          phase: 'cashfree_pricing_failed',
          subscriptionId: sub.id,
          refId: sub.refId,
          frequency: sub.frequency,
          nextBillingIst: formatIstDate(sub.nextBillingDate),
          nowIst: formatIstDate(asOfDate),
          error: error instanceof Error ? error.message : String(error),
        },
        `${AUTOPAY_TRACE} Cashfree CHARGE was not scheduled because pricing failed`,
      );
      return;
    }

    const cycle = await this.billingCycleService.getOrCreate({
      subscriptionId: sub.id,
      userId: sub.userId,
      billingCycleRef,
      sequence: (sub.billingCycleSequence ?? 0) + 1,
      chargeDate: sub.nextBillingDate,
      estimatedDeliveryDate: getEstimatedDeliveryDate(sub.nextBillingDate, deliveryLead),
      amount: quote.finalAmount,
      pricingSnapshot: buildRenewalPricingSnapshot(quote, { frequency: sub.frequency }),
      actor: 'scheduler',
    });
    const amount = isBillingCyclePricingLocked(cycle.status) ? cycle.amount : quote.finalAmount;
    if (
      cycle.status === SubscriptionBillingCycleStatus.PAID ||
      cycle.status === SubscriptionBillingCycleStatus.PAID_ORDER_PENDING ||
      cycle.status === SubscriptionBillingCycleStatus.SKIPPED ||
      cycle.status === SubscriptionBillingCycleStatus.DEBIT_PENDING ||
      cycle.status === SubscriptionBillingCycleStatus.NOTIFICATION_SENT
    ) {
      return;
    }
    if (decision.outcome === 'missed') {
      this.logger.warn(
        {
          event: AUTOPAY_TRACE,
          phase: 'cashfree_window_missed',
          subscriptionId: sub.id,
          refId: sub.refId,
          frequency: sub.frequency,
          billingCycleRef,
          nextBillingIst: formatIstDate(sub.nextBillingDate),
          nowIst: formatIstDate(asOfDate),
          liveAmount: amount,
          reason: decision.reason,
        },
        `${AUTOPAY_TRACE} Cashfree same-day window was missed; AutoPay CHARGE is scheduled on the next legal slot`,
      );
      await this.attemptAutopay(
        sub,
        cycle,
        mandate.id,
        amount,
        billingCycleRef,
        nextLegalCashfreeChargeDate({
          now: asOfDate,
          method: String(mandate.consentEvidence?.method ?? ''),
        }),
      );
      return;
    }

    if (!isAmountWithinMandateLimit(amount, mandate.maxAmount)) {
      await this.markMandateLimitExceeded(sub, cycle, amount, mandate.maxAmount);
      return;
    }

    if (cycle.paymentId) {
      const existingPayment = await this.paymentsService.findById(cycle.paymentId);
      if (existingPayment?.status === SubscriptionPaymentStatus.PAID) return;
      if (existingPayment?.status === SubscriptionPaymentStatus.RECONCILING) return;
      // Unpaid MANUAL_LINK early-pay sessions may be superseded by AutoPay CHARGE.
      if (
        existingPayment?.attemptKind === SubscriptionPaymentAttemptKind.AUTOPAY &&
        (existingPayment.gatewayOrderId || existingPayment.gatewayPaymentId)
      ) {
        return;
      }
    }

    await this.attemptAutopay(sub, cycle, mandate.id, amount, billingCycleRef, sub.nextBillingDate);
  }

  /**
   * Records a missed Cashfree CHARGE window once per billing cycle.
   * Returns false when this cycle was already marked MISSED_SCHEDULE so the
   * minute/hourly scheduler does not spam history or rewrite the same row.
   */
  private async recordMissedCashfreeSchedule(
    sub: UserProductSubscriptionEntity,
    cycleId: string,
    reason: string,
    billingCycleRef: string,
  ): Promise<boolean> {
    const current = await this.billingCycleService.findById(cycleId);
    if (current?.skipReason === CASHFREE_MISSED_SCHEDULE_REASON) {
      return false;
    }
    this.logger.warn(
      { subscriptionId: sub.id, billingCycleRef, reason },
      'Cashfree CHARGE window was missed; debit date was not shifted',
    );
    await this.billingCycleService.updateById(cycleId, {
      skipReason: CASHFREE_MISSED_SCHEDULE_REASON,
      failureReason: reason,
      updatedBy: 'scheduler',
    });
    await this.historyRepository.append({
      subscriptionId: sub.id,
      action: SubscriptionHistoryAction.SKIPPED,
      performedBy: 'scheduler',
      reason: CASHFREE_MISSED_SCHEDULE_REASON,
      details: { reason: CASHFREE_MISSED_SCHEDULE_REASON, billingCycleRef, message: reason },
    });
    return true;
  }

  async processGraceAndExpiry(asOfDate = new Date()): Promise<number> {
    const pastDue = await this.subscriptionsRepository.findDueForRenewal(
      [ProductSubscriptionStatus.RENEWAL_PAYMENT_PENDING, ProductSubscriptionStatus.PAST_DUE],
      asOfDate,
    );
    let updated = 0;
    for (const sub of pastDue) {
      try {
        const graceDays = sub.config?.gracePeriodDays ?? 7;
        const billing = sub.nextBillingDate;
        if (!billing) continue;
        const graceEnd = new Date(billing.getTime());
        graceEnd.setUTCDate(graceEnd.getUTCDate() + graceDays);
        if (asOfDate <= graceEnd) {
          if (sub.status !== ProductSubscriptionStatus.PAST_DUE) {
            await this.subscriptionsRepository.updateById(sub.id, {
              status: ProductSubscriptionStatus.PAST_DUE,
              updatedBy: 'scheduler',
            });
            updated += 1;
          }
          continue;
        }

        const action = sub.config?.missedPaymentAction ?? SubscriptionMissedPaymentAction.PAUSE;
        await this.subscriptionsRepository.updateById(sub.id, {
          status:
            action === SubscriptionMissedPaymentAction.EXPIRE
              ? ProductSubscriptionStatus.EXPIRED
              : ProductSubscriptionStatus.PAUSED,
          pausedAt: action === SubscriptionMissedPaymentAction.PAUSE ? asOfDate : sub.pausedAt,
          updatedBy: 'scheduler',
        });
        updated += 1;
      } catch (error) {
        this.logger.error(
          {
            subscriptionId: sub.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Grace/expiry pass skipped this subscription after an error',
        );
      }
    }
    return updated;
  }

  async processReminders(asOfDate = new Date()): Promise<number> {
    const active = await this.subscriptionsRepository.findDueForRenewal(
      [ProductSubscriptionStatus.ACTIVE, ProductSubscriptionStatus.RENEWAL_PAYMENT_PENDING],
      new Date(asOfDate.getTime() + 8 * 24 * 60 * 60 * 1000),
    );
    let sent = 0;
    for (const sub of active) {
      if (!sub.nextBillingDate) continue;
      if (
        sub.status === ProductSubscriptionStatus.PAUSED ||
        sub.status === ProductSubscriptionStatus.CANCELLED ||
        sub.status === ProductSubscriptionStatus.EXPIRED
      ) {
        continue;
      }
      const timezone = sub.timezone || sub.config?.timezone || 'Asia/Kolkata';
      const daysUntil = calendarDaysUntil(asOfDate, sub.nextBillingDate, timezone);
      const offsets = resolveReminderOffsets(sub.config?.reminderOffsetsJson);
      if (!offsets.includes(daysUntil)) continue;

      const owned = await this.lockService.withDbLock(`reminder:${sub.id}:${daysUntil}`, async () => {
        const cycle = await this.ensureUpcomingBillingCycle(sub, 'scheduler');
        if (!cycle) return false;
        if (
          cycle.status === SubscriptionBillingCycleStatus.PAID ||
          cycle.status === SubscriptionBillingCycleStatus.PAID_ORDER_PENDING ||
          cycle.status === SubscriptionBillingCycleStatus.SKIPPED
        ) {
          return false;
        }
        const existingPayment = cycle.paymentId
          ? await this.paymentsService.findById(cycle.paymentId)
          : (await this.paymentsService.findBySubscriptionId(sub.id)).find(
              (row) => row.billingCycleRef === cycle.billingCycleRef,
            );
        if (existingPayment?.status === SubscriptionPaymentStatus.PAID) return false;
        if (this.isAutopayCollectionInFlight(cycle, existingPayment)) return false;

        const already = await this.reminderLogsRepository.findSent({
          subscriptionId: sub.id,
          billingCycleRef: cycle.billingCycleRef,
          daysBefore: daysUntil,
          channel: 'email',
        });
        if (already) return false;

        const link = await this.ensureEarlyPaymentLink(sub, cycle, 'scheduler');
        if (!link?.paymentLink) {
          this.logger.warn(
            { subscriptionId: sub.id, billingCycleRef: cycle.billingCycleRef, daysUntil },
            'Reminder skipped — early payment link could not be generated',
          );
          return false;
        }

        const claimed = await this.reminderLogsRepository.tryRecordSend({
          subscriptionId: sub.id,
          billingCycleRef: cycle.billingCycleRef,
          daysBefore: daysUntil,
          channel: 'email',
          paymentId: cycle.paymentId,
          actor: 'scheduler',
        });
        if (!claimed) return false;

        const [productMap, variantMap] = await Promise.all([
          this.relationLoader.loadProductEntitiesByIds([sub.productId]),
          this.relationLoader.loadVariantsByIds([sub.productVariantId]),
        ]);
        const product = productMap.get(sub.productId);
        const variant = variantMap.get(sub.productVariantId);
        const emailed = await this.notificationsService.sendRenewalReminderEmail({
          userId: sub.userId,
          kind: 'product_subscription',
          paymentLink: link.paymentLink,
          amount: cycle.amount,
          currency: cycle.currency,
          daysBefore: daysUntil,
          scheduledRenewalDate: sub.nextBillingDate!.toISOString(),
          productName: product?.name ?? null,
          variantName: variant?.displayName ?? null,
          sku: variant?.sku ?? null,
          refId: sub.refId,
          autopayEnabled: sub.autopayReady,
        });
        if (!emailed) {
          this.logger.warn(
            { subscriptionId: sub.id, billingCycleRef: cycle.billingCycleRef, daysUntil },
            'Reminder log claimed but email was not delivered — will not retry the same offset',
          );
        }
        return emailed;
      });
      if (owned) sent += 1;
    }
    return sent;
  }

  private async collectNotifiedUpiDebit(
    sub: UserProductSubscriptionEntity,
    cycle: { id: string; paymentId?: string | null },
  ): Promise<void> {
    await this.lockService.withDbLock(`upi-debit:${cycle.id}`, async () => {
      const current = await this.billingCycleService.findById(cycle.id);
      if (!current) return;
      if (current.status === SubscriptionBillingCycleStatus.NOTIFICATION_SENT) {
        const claimed = await this.billingCycleService.claimStatus(
          current.id,
          [SubscriptionBillingCycleStatus.NOTIFICATION_SENT],
          SubscriptionBillingCycleStatus.DEBIT_PENDING,
          'scheduler',
        );
        if (!claimed) return;
      } else if (current.status === SubscriptionBillingCycleStatus.DEBIT_PENDING) {
        const claimed = await this.billingCycleService.claimDebitRetry(
          current.id,
          new Date(Date.now() - UPI_DEBIT_ABSENT_RETRY_MS),
          'scheduler',
        );
        if (!claimed) return;
      } else {
        return;
      }
      const paymentId = current.paymentId ?? cycle.paymentId ?? null;
      const payment = paymentId ? await this.paymentsService.findById(paymentId) : null;
      if (!payment?.gatewayOrderId) return;
      const mandate = await this.mandateService.getForSubscription(sub.id);
      if (!mandate?.gatewayCustomerId || !mandate.gatewayMandateId) return;
      const adapter = this.mandateService.adapter(SubscriptionMandateProvider.RAZORPAY);
      if (!('submitRecurringDebit' in adapter)) return;
      const user = await this.usersRepository.findById(sub.userId);
      const result = await adapter.submitRecurringDebit({
        gatewayOrderId: payment.gatewayOrderId,
        gatewayCustomerId: mandate.gatewayCustomerId,
        gatewayMandateId: mandate.gatewayMandateId,
        gatewaySubscriptionId: mandate.gatewaySubscriptionId,
        amount: payment.amount,
        receipt: payment.refId,
        idempotencyKey: payment.refId,
        retryFailedPayments: true,
        customer: { email: user?.email ?? null, phone: user?.mobileNumber ?? '' },
        notes: buildSubscriptionGatewayNotes({
          paymentPurpose: SUBSCRIPTION_PAYMENT_PURPOSE.PRODUCT_SUBSCRIPTION,
          billingCycleRef: payment.billingCycleRef,
          subscriptionId: sub.id,
          subscriptionPaymentId: payment.id,
          userId: sub.userId,
          productId: sub.productId,
        }),
      });
      if (result.gatewayOrderId) {
        await this.paymentsService.recordProviderCharge(payment.id, {
          gatewayOrderId: result.gatewayOrderId,
          gatewayPaymentId: result.gatewayPaymentId,
          paymentGateway: SubscriptionMandateProvider.RAZORPAY,
          pending: Boolean(result.pending || !result.gatewayPaymentId),
          actor: 'scheduler',
        });
      }
      if (result.pending || !result.gatewayPaymentId) return;
      if (!result.accepted) {
        await this.paymentsService.markFailed(
          payment.id,
          result.failureReason ?? 'AutoPay declined',
          'scheduler',
        );
        await this.billingCycleService.updateById(current.id, {
          status: SubscriptionBillingCycleStatus.FAILED,
          failureReason: result.failureReason ?? 'AutoPay declined',
          updatedBy: 'scheduler',
        });
        return;
      }
      await this.handlePaymentSuccess({
        paymentId: payment.id,
        gatewayOrderId: result.gatewayOrderId ?? payment.gatewayOrderId,
        gatewayPaymentId: result.gatewayPaymentId ?? undefined,
        actor: 'scheduler-autopay',
      });
    });
  }

  private async recoverUnchargedUpiOrder(
    sub: UserProductSubscriptionEntity,
    cycle: { id: string; paymentId?: string | null },
    orderId: string,
  ): Promise<void> {
    const adapter = this.mandateService.adapter(SubscriptionMandateProvider.RAZORPAY);
    if (!('listOrderCharge' in adapter) || typeof adapter.listOrderCharge !== 'function') return;
    const listed = await adapter.listOrderCharge(orderId);
    if (listed.outcome === 'unknown') return;
    if (listed.outcome === 'found') {
      const payment = cycle.paymentId ? await this.paymentsService.findById(cycle.paymentId) : null;
      if (payment) await this.applyReconciledUpiCharge(sub, cycle, payment, listed.snapshot, new Date());
      return;
    }
    await this.collectNotifiedUpiDebit(sub, cycle);
  }

  /**
   * A failed UPI cycle is restored only when Razorpay confirms the order has no payment.
   * A listed payment is reconciled. An unreadable order is left unchanged.
   * Returns `schedule` when no Razorpay order exists, so the caller can register the original debit time.
   */
  private async recoverFailedUpiCycle(
    sub: UserProductSubscriptionEntity,
    cycle: {
      id: string;
      paymentId?: string | null;
      chargeDate?: Date | null;
      debitEarliestAt?: Date | null;
    },
    asOfDate: Date,
    allowNewNotification = false,
  ): Promise<'schedule' | 'stop'> {
    if (this.mandateService.resolveChargeProvider(sub) !== SubscriptionMandateProvider.RAZORPAY) return 'stop';
    const mandate = await this.mandateService.getForSubscription(sub.id);
    const method = String(mandate?.consentEvidence?.method ?? '');
    if (!mandate || method === 'card' || method === 'emandate') return 'stop';
    const payment = cycle.paymentId ? await this.paymentsService.findById(cycle.paymentId) : null;
    if (payment?.gatewayPaymentId) {
      const snapshot = await this.mandateService.adapter(SubscriptionMandateProvider.RAZORPAY).fetchChargeStatus({
        gatewayOrderId: payment.gatewayOrderId,
        gatewayPaymentId: payment.gatewayPaymentId,
      });
      if (snapshot.state === 'unknown' && !snapshot.gatewayPaymentId) return 'stop';
      await this.applyReconciledUpiCharge(sub, cycle, payment, snapshot, asOfDate);
      return 'stop';
    }
    if (payment?.gatewayOrderId) {
      const adapter = this.mandateService.adapter(SubscriptionMandateProvider.RAZORPAY);
      if (!('listOrderCharge' in adapter) || typeof adapter.listOrderCharge !== 'function') return 'stop';
      const listed = await adapter.listOrderCharge(payment.gatewayOrderId);
      if (listed.outcome === 'unknown') return 'stop';
      if (listed.outcome === 'found') {
        await this.applyReconciledUpiCharge(sub, cycle, payment, listed.snapshot, asOfDate);
        return 'stop';
      }
      const dueAt = cycle.debitEarliestAt ?? cycle.chargeDate ?? null;
      await this.billingCycleService.updateById(cycle.id, {
        status: SubscriptionBillingCycleStatus.NOTIFICATION_SENT,
        failureReason: null,
        ...(dueAt ? { debitEarliestAt: dueAt } : {}),
        updatedBy: 'scheduler-reconcile',
      });
      if (dueAt && dueAt.getTime() <= asOfDate.getTime()) {
        await this.collectNotifiedUpiDebit(sub, { id: cycle.id, paymentId: payment.id });
      }
      return 'stop';
    }
    if (!allowNewNotification) return 'stop';
    await this.billingCycleService.updateById(cycle.id, {
      status: SubscriptionBillingCycleStatus.SCHEDULED,
      failureReason: null,
      updatedBy: 'scheduler-reconcile',
    });
    return 'schedule';
  }

  private async applyReconciledUpiCharge(
    sub: UserProductSubscriptionEntity,
    cycle: { id: string; chargeDate?: Date | null; debitEarliestAt?: Date | null },
    payment: { id: string; amount: string; gatewayOrderId?: string | null },
    snapshot: {
      state: string;
      gatewayOrderId?: string | null;
      gatewayPaymentId?: string | null;
      amount?: string | null;
      failureReason?: string | null;
    },
    asOfDate: Date,
  ): Promise<void> {
    const dueAt = cycle.debitEarliestAt ?? cycle.chargeDate ?? null;
    if (snapshot.state === 'failed' && dueAt && dueAt.getTime() > asOfDate.getTime()) {
      await this.paymentsService.markReconciling(payment.id, 'scheduler-reconcile');
      await this.billingCycleService.updateById(cycle.id, {
        status: SubscriptionBillingCycleStatus.NOTIFICATION_SENT,
        failureReason: null,
        debitEarliestAt: dueAt,
        updatedBy: 'scheduler-reconcile',
      });
      return;
    }
    if (snapshot.gatewayPaymentId) {
      await this.paymentsService.recordProviderCharge(payment.id, {
        gatewayOrderId: snapshot.gatewayOrderId ?? payment.gatewayOrderId ?? '',
        gatewayPaymentId: snapshot.gatewayPaymentId,
        paymentGateway: SubscriptionMandateProvider.RAZORPAY,
        pending: snapshot.state !== 'failed',
        actor: 'scheduler-reconcile',
      });
    }
    if (this.snapshotPaysProductAmount(payment.amount, snapshot)) {
      await this.handlePaymentSuccess({
        paymentId: payment.id,
        gatewayOrderId: snapshot.gatewayOrderId ?? payment.gatewayOrderId ?? undefined,
        gatewayPaymentId: snapshot.gatewayPaymentId ?? undefined,
        actor: 'scheduler-reconcile',
      });
      return;
    }
    if (snapshot.state === 'failed' && snapshot.gatewayPaymentId) {
      const reason = snapshot.failureReason ?? 'Recurring payment failed';
      await this.paymentsService.markFailed(payment.id, reason, 'scheduler-reconcile');
      await this.billingCycleService.updateById(cycle.id, {
        status: SubscriptionBillingCycleStatus.FAILED,
        failureReason: reason,
        updatedBy: 'scheduler-reconcile',
      });
      return;
    }
    if (snapshot.gatewayPaymentId && snapshot.state !== 'failed') {
      await this.billingCycleService.updateById(cycle.id, {
        status: SubscriptionBillingCycleStatus.DEBIT_PENDING,
        failureReason: null,
        updatedBy: 'scheduler-reconcile',
      });
    }
  }

  private async reconcileInFlightDebit(
    sub: UserProductSubscriptionEntity,
    cycle: {
      id: string;
      paymentId: string | null;
      orderId?: string | null;
      debitEarliestAt?: Date | null;
      chargeDate?: Date | null;
    },
    asOfDate = new Date(),
  ): Promise<void> {
    const payment = cycle.paymentId ? await this.paymentsService.findById(cycle.paymentId) : null;
    if (!payment) {
      this.logger.warn(
        { subscriptionId: sub.id, cycleId: cycle.id },
        'Debit is pending without a payment row, so no new charge was created',
      );
      return;
    }
    if (payment.status === SubscriptionPaymentStatus.PAID) {
      if (!cycle.orderId) {
        const order = await this.tryCreateOrderForPaidCycle(sub, payment, 'scheduler-reconcile');
        if (order) {
          await this.billingCycleService.updateById(cycle.id, {
            status: SubscriptionBillingCycleStatus.PAID,
            orderId: order.id,
            paymentId: payment.id,
            updatedBy: 'scheduler-reconcile',
          });
        }
      }
      return;
    }

    const provider = this.mandateService.resolveChargeProvider(sub);
    if (!provider) {
      this.logger.warn(
        { subscriptionId: sub.id },
        'In-flight debit was left untouched until its gateway reports a final status',
      );
      return;
    }

    const mandate = await this.mandateService.getForSubscription(sub.id);
    const snapshot = await this.mandateService.adapter(provider).fetchChargeStatus({
      gatewayOrderId: payment.gatewayOrderId,
      gatewayPaymentId: payment.gatewayPaymentId,
      gatewaySubscriptionId:
        provider === SubscriptionMandateProvider.CASHFREE
          ? resolveCashfreeMerchantSubscriptionId(
              mandate?.authorizationOrderId,
              mandate?.gatewaySubscriptionId,
            )
          : (mandate?.gatewaySubscriptionId ?? mandate?.authorizationOrderId),
      expectedAmount: payment.amount,
      expectedCurrency: payment.currency,
    });
    if (this.snapshotPaysProductAmount(payment.amount, snapshot)) {
      await this.handlePaymentSuccess({
        paymentId: payment.id,
        gatewayOrderId: snapshot.gatewayOrderId ?? payment.gatewayOrderId ?? undefined,
        gatewayPaymentId: snapshot.gatewayPaymentId ?? payment.gatewayPaymentId ?? undefined,
        actor: 'scheduler-reconcile',
      });
      return;
    }
    if (snapshot.state === 'captured') {
      this.logger.warn(
        {
          subscriptionId: sub.id,
          cycleId: cycle.id,
          expectedAmount: payment.amount,
          capturedAmount: snapshot.amount,
        },
        'Captured gateway payment does not match the product amount, so no order was created',
      );
      return;
    }
    const dueAt = cycle.debitEarliestAt ?? cycle.chargeDate ?? null;
    const debitIsDue = !dueAt || dueAt.getTime() <= asOfDate.getTime();
    if (snapshot.gatewayPaymentId && snapshot.gatewayPaymentId !== payment.gatewayPaymentId) {
      await this.paymentsService.recordProviderCharge(payment.id, {
        gatewayOrderId: snapshot.gatewayOrderId ?? payment.gatewayOrderId ?? '',
        gatewayPaymentId: snapshot.gatewayPaymentId,
        paymentGateway: provider,
        pending: snapshot.state !== 'failed',
        actor: 'scheduler-reconcile',
      });
    }
    if (snapshot.state === 'failed' && debitIsDue && snapshot.gatewayPaymentId) {
      const reason = snapshot.failureReason ?? 'Recurring payment failed';
      await this.paymentsService.markFailed(payment.id, reason, 'scheduler-reconcile');
      await this.billingCycleService.updateById(cycle.id, {
        status: SubscriptionBillingCycleStatus.FAILED,
        failureReason: reason,
        updatedBy: 'scheduler-reconcile',
      });
      return;
    }
    if (snapshot.state === 'pending' || snapshot.gatewayPaymentId) {
      this.logger.warn(
        { subscriptionId: sub.id, cycleId: cycle.id, state: snapshot.state, provider },
        'Debit is not captured, so no new charge was created',
      );
      return;
    }
    if (provider !== SubscriptionMandateProvider.RAZORPAY) {
      this.logger.warn(
        { subscriptionId: sub.id, cycleId: cycle.id, state: snapshot.state, provider },
        'Debit outcome is still unknown, so no new charge was created',
      );
      return;
    }
    if (debitIsDue && payment.gatewayOrderId && !payment.gatewayPaymentId && !snapshot.gatewayPaymentId) {
      await this.recoverUnchargedUpiOrder(sub, cycle, payment.gatewayOrderId);
      return;
    }
    this.logger.warn(
      { subscriptionId: sub.id, cycleId: cycle.id, state: snapshot.state, provider },
      'Debit is not captured, so no new charge was created',
    );
  }

  private async processSingleRenewal(subscriptionId: string, asOfDate: Date): Promise<void> {
    const sub = await this.subscriptionsRepository.findById(subscriptionId);
    if (!sub || !sub.nextBillingDate) return;

    const openCycles = await this.billingCycleService.findBySubscriptionId(sub.id);
    const debitInFlight = openCycles.find((cycle) => cycle.status === SubscriptionBillingCycleStatus.DEBIT_PENDING);
    if (debitInFlight) {
      await this.reconcileInFlightDebit(sub, debitInFlight, asOfDate);
      return;
    }
    const notified = openCycles.find((cycle) => cycle.status === SubscriptionBillingCycleStatus.NOTIFICATION_SENT);
    if (notified) {
      const dueAt = notified.debitEarliestAt ?? notified.chargeDate;
      if (dueAt.getTime() > asOfDate.getTime()) return;
      await this.collectNotifiedUpiDebit(sub, notified);
      return;
    }
    if (sub.status === ProductSubscriptionStatus.PAUSED || sub.status === ProductSubscriptionStatus.CANCELLED) {
      return;
    }

    const timezone = sub.timezone || 'Asia/Kolkata';
    const deliveryLead = sub.config?.deliveryLeadDays ?? 2;
    const { nextBillingDate, skippedCount } = advancePastMissedCycles({
      nextBillingDate: sub.nextBillingDate,
      frequency: sub.frequency,
      asOfDate,
      timeZone: timezone,
      anchorDay: sub.scheduleAnchorDay,
    });
    if (skippedCount > 0) {
      await this.subscriptionsRepository.updateById(sub.id, {
        nextBillingDate,
        nextDeliveryDate: getEstimatedDeliveryDate(nextBillingDate, deliveryLead),
        updatedBy: 'scheduler',
      });
      this.logger.warn(
        { subscriptionId: sub.id, skippedCount },
        'Skipped missed cycles after downtime — no catch-up charging',
      );
    }

    const chargeDate = skippedCount > 0 ? nextBillingDate : sub.nextBillingDate;
    if (chargeDate.getTime() > asOfDate.getTime()) return;

    const billingCycleRef = buildBillingCycleRef(chargeDate, sub.frequency);
    let quote: SubscriptionRenewalQuote;
    try {
      quote = await this.quoteRenewal(sub);
    } catch (error) {
      this.logger.warn(
        { subscriptionId: sub.id, error: error instanceof Error ? error.message : String(error) },
        'Renewal pricing failed — leaving subscription for retry',
      );
      return;
    }

    const cycle = await this.billingCycleService.getOrCreate({
      subscriptionId: sub.id,
      userId: sub.userId,
      billingCycleRef,
      sequence: (sub.billingCycleSequence ?? 0) + 1,
      chargeDate,
      estimatedDeliveryDate: getEstimatedDeliveryDate(chargeDate, deliveryLead),
      amount: quote.finalAmount,
      pricingSnapshot: buildRenewalPricingSnapshot(quote, { frequency: sub.frequency }),
      actor: 'scheduler',
    });
    const amount = isBillingCyclePricingLocked(cycle.status) ? cycle.amount : quote.finalAmount;
    if (
      cycle.status === SubscriptionBillingCycleStatus.PAID ||
      cycle.status === SubscriptionBillingCycleStatus.PAID_ORDER_PENDING ||
      cycle.status === SubscriptionBillingCycleStatus.SKIPPED ||
      cycle.status === SubscriptionBillingCycleStatus.DEBIT_PENDING
    ) {
      return;
    }
    {
      const byId = cycle.paymentId
        ? await this.paymentsService.findById(cycle.paymentId)
        : null;
      const rows = byId ? [] : await this.paymentsService.findBySubscriptionId(sub.id);
      const existingPayment =
        byId ?? rows.find((row) => row.billingCycleRef === billingCycleRef) ?? null;
      if (existingPayment?.status === SubscriptionPaymentStatus.PAID) return;
      if (existingPayment?.status === SubscriptionPaymentStatus.RECONCILING) {
        this.logger.log(
          { subscriptionId: sub.id, billingCycleRef, paymentId: existingPayment.id },
          'Skipping AutoPay — cycle payment is already reconciling (early pay or prior charge)',
        );
        return;
      }
    }
    if (cycle.status === SubscriptionBillingCycleStatus.FAILED) {
      const existingPayment = cycle.paymentId
        ? await this.paymentsService.findById(cycle.paymentId)
        : null;
      if (
        existingPayment?.attemptKind === SubscriptionPaymentAttemptKind.AUTOPAY &&
        (existingPayment.gatewayOrderId || existingPayment.gatewayPaymentId)
      ) {
        await this.recoverFailedUpiCycle(sub, cycle, asOfDate);
        return;
      }
    }

    const mandate = await this.mandateService.getForSubscription(sub.id);
    const autopay = this.mandateService.canPresentAsAutopay(sub, mandate);
    if (autopay && mandate) {
      if (!isAmountWithinMandateLimit(amount, mandate.maxAmount)) {
        await this.markMandateLimitExceeded(sub, cycle, amount, mandate.maxAmount);
      } else {
        const provider = this.mandateService.resolveChargeProvider(sub);
        const advanceCashfree =
          provider === SubscriptionMandateProvider.CASHFREE &&
          isCashfreeAdvanceChargeEnabled(this.nestConfig);
        if (advanceCashfree) {
          const decision = resolveCashfreeChargeSchedule({
            intended: chargeDate,
            now: asOfDate,
            method: String(mandate.consentEvidence?.method ?? ''),
          });
          if (decision.outcome === 'wait') {
            if (isHourlyAutopayTrace(asOfDate)) {
              this.logAutopayTrace('cashfree_charge_wait', {
                subscriptionId: sub.id,
                refId: sub.refId,
                frequency: sub.frequency,
                billingCycleRef,
                nextBillingIst: formatIstDate(chargeDate),
                nowIst: formatIstDate(asOfDate),
                liveAmount: amount,
                reason: decision.reason,
              });
            }
            return;
          }
          const debitAt =
            decision.outcome === 'schedule'
              ? chargeDate
              : nextLegalCashfreeChargeDate({
                  now: asOfDate,
                  method: String(mandate.consentEvidence?.method ?? ''),
                });
          if (decision.outcome === 'missed') {
            this.logger.warn(
              {
                event: AUTOPAY_TRACE,
                phase: 'cashfree_window_missed',
                subscriptionId: sub.id,
                refId: sub.refId,
                frequency: sub.frequency,
                billingCycleRef,
                nextBillingIst: formatIstDate(chargeDate),
                nowIst: formatIstDate(asOfDate),
                liveAmount: amount,
                reason: decision.reason,
              },
              `${AUTOPAY_TRACE} Cashfree same-day window was missed; AutoPay CHARGE is scheduled on the next legal slot`,
            );
          }
          const charged = await this.attemptAutopay(
            sub,
            cycle,
            mandate.id,
            amount,
            billingCycleRef,
            debitAt,
          );
          if (!charged) {
            this.logger.warn(
              { subscriptionId: sub.id, billingCycleRef },
              'AutoPay debit was not accepted. No second charge is sent while that payment is failed or still unresolved.',
            );
          }
          return;
        } else {
          const charged = await this.attemptAutopay(sub, cycle, mandate.id, amount, billingCycleRef);
          if (!charged) {
            this.logger.warn(
              { subscriptionId: sub.id, billingCycleRef },
              'AutoPay debit was not accepted. No second charge is sent while that Razorpay payment is failed or still unresolved.',
            );
          }
          return;
        }
      }
    }

    const payment = await this.paymentsService.upsertPendingCycle({
      subscriptionId: sub.id,
      userId: sub.userId,
      billingCycleRef,
      amount,
      billingDate: chargeDate,
      actor: 'scheduler',
    });
    await this.paymentsService.attachCycleMetadata(payment.id, {
      billingCycleId: cycle.id,
      attemptKind: SubscriptionPaymentAttemptKind.MANUAL_LINK,
      actor: 'scheduler',
    });

    if (payment.status === SubscriptionPaymentStatus.PAID) return;
    if (payment.status === SubscriptionPaymentStatus.RECONCILING) return;

    if (payment.status === SubscriptionPaymentStatus.LINK_GENERATED && payment.paymentLink) {
      await this.subscriptionsRepository.updateById(sub.id, {
        status: ProductSubscriptionStatus.RENEWAL_PAYMENT_PENDING,
        updatedBy: 'scheduler',
      });
      await this.billingCycleService.updateById(cycle.id, {
        status: SubscriptionBillingCycleStatus.LINK_GENERATED,
        paymentId: payment.id,
        updatedBy: 'scheduler',
      });
      return;
    }

    const user = await this.usersRepository.findById(sub.userId);
    const persistedGateway = (sub.paymentGateway ?? '').toUpperCase();
    const link = await this.paymentLinkService.createPaymentLink({
      amount,
      referenceId: payment.refId,
      preferredGateway:
        persistedGateway === 'RAZORPAY' || persistedGateway === 'CASHFREE'
          ? persistedGateway
          : null,
      customer: {
        id: sub.userId,
        name: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || undefined,
        email: user?.email,
        phone: user?.mobileNumber ?? '',
      },
      notes: buildSubscriptionGatewayNotes({
        paymentPurpose: SUBSCRIPTION_PAYMENT_PURPOSE.PRODUCT_SUBSCRIPTION,
        billingCycleRef,
        subscriptionId: sub.id,
        subscriptionPaymentId: payment.id,
        userId: sub.userId,
        productId: sub.productId,
      }),
    });

    await this.paymentsService.attachPaymentLink(payment.id, {
      paymentLink: link.paymentLink ?? '',
      gatewayOrderId: link.gatewayOrderId,
      paymentGateway: link.paymentGateway,
      actor: 'scheduler',
    });
    await this.billingCycleService.updateById(cycle.id, {
      status: SubscriptionBillingCycleStatus.LINK_GENERATED,
      paymentId: payment.id,
      updatedBy: 'scheduler',
    });
    await this.subscriptionsRepository.updateById(sub.id, {
      status: ProductSubscriptionStatus.RENEWAL_PAYMENT_PENDING,
      paymentGateway: sub.paymentGateway ?? link.paymentGateway,
      updatedBy: 'scheduler',
    });

    this.notificationsService.notifyRenewalDue({
      userId: sub.userId,
      kind: 'product_subscription',
      paymentLink: link.paymentLink ?? '',
      amount,
      refId: sub.refId,
    });
  }

  /**
   * AUTH ₹ setup is not merchandise. After the mandate is ACTIVE, raise the first
   * product CHARGE at the live price (Cashfree T+1 / T+2 legal slot).
   */
  async tryChargeCashfreeFirstOrderAfterAuth(params: {
    gatewaySubscriptionId?: string;
    actor: string;
  }): Promise<boolean> {
    const mandate = await this.mandateService.findByGatewayReference(params.gatewaySubscriptionId);
    if (!mandate || mandate.provider !== SubscriptionMandateProvider.CASHFREE) return false;
    if (mandate.consentEvidence?.firstCharge === true) return false;
    const sub = await this.subscriptionsRepository.findById(mandate.subscriptionId);
    if (!sub) return false;
    if (
      sub.status === ProductSubscriptionStatus.CANCELLED ||
      sub.status === ProductSubscriptionStatus.EXPIRED ||
      sub.status === ProductSubscriptionStatus.PAUSED
    ) {
      return false;
    }
    if (this.mandateService.resolveChargeProvider(sub) !== SubscriptionMandateProvider.CASHFREE) {
      return false;
    }
    if (!this.mandateService.canPresentAsAutopay(sub, mandate)) return false;

    const cycles = await this.billingCycleService.findBySubscriptionId(sub.id);
    const first = cycles.find((cycle) => cycle.sequence === 1) ?? cycles[cycles.length - 1];
    if (!first) return false;
    if (
      first.status === SubscriptionBillingCycleStatus.PAID ||
      first.status === SubscriptionBillingCycleStatus.PAID_ORDER_PENDING ||
      first.status === SubscriptionBillingCycleStatus.DEBIT_PENDING ||
      first.status === SubscriptionBillingCycleStatus.NOTIFICATION_SENT
    ) {
      return true;
    }

    const existingPayment = first.paymentId
      ? await this.paymentsService.findById(first.paymentId)
      : (await this.paymentsService.findBySubscriptionId(sub.id)).find(
          (row) => row.attemptKind === SubscriptionPaymentAttemptKind.FIRST_ORDER,
        );
    if (existingPayment?.status === SubscriptionPaymentStatus.PAID) return true;

    let quote: SubscriptionRenewalQuote;
    try {
      quote = await this.quoteRenewal(sub);
    } catch (error) {
      this.logger.warn(
        {
          subscriptionId: sub.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Cashfree first product CHARGE was not scheduled because pricing failed',
      );
      return false;
    }
    const amount = isBillingCyclePricingLocked(first.status) ? first.amount : quote.finalAmount;
    if (!isBillingCyclePricingLocked(first.status)) {
      await this.billingCycleService.updateById(first.id, {
        amount,
        pricingSnapshot: buildRenewalPricingSnapshot(quote, { frequency: sub.frequency }),
        updatedBy: params.actor,
      });
    }
    if (!isAmountWithinMandateLimit(amount, mandate.maxAmount)) {
      await this.markMandateLimitExceeded(sub, first, amount, mandate.maxAmount);
      return false;
    }
    const debitAt = nextLegalCashfreeChargeDate({
      method: String(mandate.consentEvidence?.method ?? ''),
    });
    return this.attemptAutopay(sub, first, mandate.id, amount, first.billingCycleRef, debitAt);
  }

  private async chargePendingCashfreeFirstOrders(asOfDate: Date): Promise<void> {
    void asOfDate;
    const pending = await this.subscriptionsRepository.findAutopayReadyPendingPayment(
      SubscriptionMandateProvider.CASHFREE,
    );
    for (const sub of pending) {
      await this.runIsolatedSubscriptionPass(sub.id, 'cashfree-first-charge', async () => {
        const mandate = await this.mandateService.getForSubscription(sub.id);
        await this.tryChargeCashfreeFirstOrderAfterAuth({
          gatewaySubscriptionId:
            mandate?.authorizationOrderId ?? mandate?.gatewaySubscriptionId ?? undefined,
          actor: 'scheduler',
        });
      });
    }
  }

  private async markMandateLimitExceeded(
    sub: UserProductSubscriptionEntity,
    cycle: { id: string; skipReason?: string | null },
    amount: string,
    maxAmount: string | number | null | undefined,
  ): Promise<void> {
    this.logger.warn(
      {
        event: AUTOPAY_TRACE,
        phase: 'mandate_limit_exceeded',
        subscriptionId: sub.id,
        refId: sub.refId,
        frequency: sub.frequency,
        liveAmount: amount,
        maxAmount,
        nextBillingIst: formatIstDate(sub.nextBillingDate),
        nowIst: formatIstDate(new Date()),
      },
      `${AUTOPAY_TRACE} Renewal exceeds the approved mandate maximum — AutoPay CHARGE was not sent`,
    );
    if (cycle.skipReason === MANDATE_LIMIT_EXCEEDED_REASON) return;
    await this.billingCycleService.updateById(cycle.id, {
      skipReason: MANDATE_LIMIT_EXCEEDED_REASON,
      failureReason: `Renewal ${amount} exceeds approved mandate maximum ${maxAmount ?? ''}`,
      updatedBy: 'scheduler',
    });
    this.notificationsService.notifyMandateLimitExceeded({
      userId: sub.userId,
      kind: 'product_subscription',
      amount,
      maxAmount: String(maxAmount ?? ''),
      refId: sub.refId,
    });
  }

  private logAutopayTrace(phase: string, details: Record<string, unknown>): void {
    this.logger.log({ event: AUTOPAY_TRACE, phase, ...details }, `${AUTOPAY_TRACE} ${phase}`);
  }

  private async recalculateAmount(sub: {
    productId?: string;
    productVariantId: string;
    quantity: number;
    discountType: import('../enums/subscription-discount-type.enum').SubscriptionDiscountType;
    discountValue: string;
    userId: string;
  }): Promise<string> {
    return (await this.quoteRenewal(sub)).finalAmount;
  }

  private async quoteRenewal(sub: {
    productId?: string;
    productVariantId: string;
    quantity: number;
    discountType: import('../enums/subscription-discount-type.enum').SubscriptionDiscountType;
    discountValue: string;
    userId: string;
  }): Promise<SubscriptionRenewalQuote> {
    if (sub.productId) {
      const product = await this.productsRepository.findPublishedById(sub.productId);
      if (!product || product.status !== ProductStatus.PUBLISHED) {
        throw new BadRequestException(PRODUCT_UNAVAILABLE_REASON);
      }
    }
    const variant = await this.variantsRepository.findById(sub.productVariantId);
    if (!variant || (sub.productId && variant.productId && variant.productId !== sub.productId)) {
      throw new BadRequestException('Variant not found for renewal pricing');
    }
    if (variant.status && variant.status !== VariantStatus.ACTIVE) {
      throw new BadRequestException(PRODUCT_UNAVAILABLE_REASON);
    }
    if (variant.outOfStock === true || (typeof variant.stock === 'number' && variant.stock < sub.quantity)) {
      throw new BadRequestException(PRODUCT_UNAVAILABLE_REASON);
    }
    const memberDiscount = await this.membershipBenefits.getMemberDiscount(sub.userId);
    const pricing = this.pricingService.calculate(
      variant.sellingPrice,
      sub.quantity,
      sub.discountType,
      sub.discountValue,
      memberDiscount,
    );
    if (Number(pricing.finalAmount) <= 0) {
      throw new BadRequestException('Renewal amount must be greater than zero');
    }
    return {
      subscriptionPrice: pricing.subscriptionPrice ?? Number(variant.sellingPrice).toFixed(2),
      discountAmount: pricing.discountAmount ?? '0.00',
      finalAmount: pricing.finalAmount,
      unitSellingPrice: Number(variant.sellingPrice).toFixed(2),
      quantity: sub.quantity,
      taxAmount: '0.00',
      shippingAmount: '0.00',
      sku: variant.sku ?? null,
      variantId: variant.id ?? sub.productVariantId,
      productId: sub.productId ?? variant.productId ?? '',
      calculatedAt: new Date().toISOString(),
    };
  }

  private async requireOwnedActiveLike(userId: string, id: string) {
    const sub = await this.subscriptionsRepository.findByIdAndUserId(id, userId);
    if (!sub) throw new NotFoundException('Subscription not found');
    if (
      ![
        ProductSubscriptionStatus.ACTIVE,
        ProductSubscriptionStatus.RENEWAL_PAYMENT_PENDING,
      ].includes(sub.status)
    ) {
      throw new BadRequestException('Subscription is not active');
    }
    return sub;
  }

  private mapGatewayToPaymentMethod(gateway: string | null): OrderPaymentMethod {
    if (gateway?.toUpperCase() === 'CASHFREE') return OrderPaymentMethod.CASHFREE;
    return OrderPaymentMethod.RAZORPAY;
  }

  async handlePaymentFailed(params: {
    gatewayOrderId?: string;
    reason?: string;
    actor?: string;
  }): Promise<boolean> {
    if (!params.gatewayOrderId) return false;
    const payment = await this.paymentsService.findByGatewayOrderId(params.gatewayOrderId);
    if (!payment) return false;
    if (payment.status === SubscriptionPaymentStatus.PAID) return true;
    const cycle = payment.billingCycleId
      ? await this.billingCycleService.findById(payment.billingCycleId)
      : null;
    const dueAt = cycle?.debitEarliestAt ?? cycle?.chargeDate ?? null;
    const stillScheduled =
      cycle?.status === SubscriptionBillingCycleStatus.NOTIFICATION_SENT ||
      cycle?.status === SubscriptionBillingCycleStatus.SCHEDULED ||
      (dueAt != null &&
        dueAt.getTime() > Date.now() &&
        cycle?.status !== SubscriptionBillingCycleStatus.DEBIT_PENDING);
    if (stillScheduled) return false;
    const alreadyFailed =
      payment.status === SubscriptionPaymentStatus.FAILED &&
      (!cycle || cycle.status === SubscriptionBillingCycleStatus.FAILED);
    if (alreadyFailed) return true;
    if (payment.status !== SubscriptionPaymentStatus.FAILED) {
      await this.paymentsService.markFailed(
        payment.id,
        params.reason ?? 'Provider reported failure',
        params.actor ?? 'webhook',
      );
    }
    if (cycle && cycle.status !== SubscriptionBillingCycleStatus.FAILED) {
      await this.billingCycleService.updateById(cycle.id, {
        status: SubscriptionBillingCycleStatus.FAILED,
        failureReason: params.reason ?? 'Provider reported failure',
        updatedBy: params.actor ?? 'webhook',
      });
    }
    await this.historyRepository.append({
      subscriptionId: payment.subscriptionId,
      action: SubscriptionHistoryAction.PAYMENT_FAILED,
      performedBy: params.actor ?? 'webhook',
      reason: params.reason,
    });
    return true;
  }

  async finalizePaidCycles(asOfDate = new Date()): Promise<number> {
    const pending = await this.billingCycleService.findPaidOrderPending(asOfDate);
    let finalized = 0;
    for (const cycle of pending) {
      const sub = await this.subscriptionsRepository.findById(cycle.subscriptionId);
      if (!sub || !cycle.paymentId) continue;
      const payment = await this.paymentsService.findById(cycle.paymentId);
      if (!payment) continue;
      const order = await this.tryCreateOrderForPaidCycle(sub, payment, 'order-finalization-retry');
      if (order) {
        await this.billingCycleService.updateById(cycle.id, {
          status: SubscriptionBillingCycleStatus.PAID,
          orderId: order.id,
          updatedBy: 'order-finalization-retry',
        });
        await this.historyRepository.append({
          subscriptionId: sub.id,
          action: SubscriptionHistoryAction.ORDER_FINALIZATION_RETRY,
          performedBy: 'scheduler',
          details: { cycleId: cycle.id, orderId: order.id },
        });
        finalized += 1;
      }
    }
    return finalized;
  }

  private async tryCreateOrderForPaidCycle(
    sub: UserProductSubscriptionEntity,
    paidPayment: { id: string; amount: string; billingCycleRef: string; paymentGateway: string | null; billingCycleId?: string | null },
    actor?: string,
  ) {
    const locked = await this.lockService.withLock(`renewal-order:${sub.id}`, async () => {
      if (paidPayment.billingCycleId) {
        const cycle = await this.billingCycleService.findById(paidPayment.billingCycleId);
        if (cycle?.orderId) return { id: cycle.orderId };
      }
      return this.createSubscriptionOrder(sub, paidPayment, actor);
    });
    if (locked) return locked;
    if (paidPayment.billingCycleId) {
      const cycle = await this.billingCycleService.findById(paidPayment.billingCycleId);
      if (cycle?.orderId) return { id: cycle.orderId };
    }
    this.logger.warn(
      { subscriptionId: sub.id, paymentId: paidPayment.id, billingCycleId: paidPayment.billingCycleId ?? null },
      'Subscription order lock did not return an order',
    );
    return null;
  }

  private async createSubscriptionOrder(
    sub: UserProductSubscriptionEntity,
    paidPayment: { id: string; amount: string; billingCycleRef: string; paymentGateway: string | null },
    actor?: string,
  ) {
    try {
      const order = await this.ordersService.createOrderFromSubscription({
        customerId: sub.userId,
        addressId: sub.addressId,
        subscriptionId: sub.id,
        subscriptionRefId: sub.refId,
        subtotal: paidPayment.amount,
        discountAmount: '0.00',
        shippingAmount: '0.00',
        grandTotal: paidPayment.amount,
        notes: `Subscription order for ${sub.refId} cycle ${paidPayment.billingCycleRef}`,
        paymentMethod: this.mapGatewayToPaymentMethod(paidPayment.paymentGateway),
        orderSource: OrderSource.WEBSITE,
        createdBy: actor ?? 'subscription-webhook',
        items: [
          {
            productId: sub.productId,
            variantId: sub.productVariantId,
            quantity: sub.quantity,
            unitPrice: (Number(paidPayment.amount) / Math.max(1, sub.quantity)).toFixed(2),
            totalPrice: paidPayment.amount,
            isSubscription: true,
            frequency: sub.frequency,
          },
        ],
      });
      await this.historyRepository.append({
        subscriptionId: sub.id,
        action: SubscriptionHistoryAction.ORDER_CREATED,
        performedBy: actor ?? 'webhook',
        details: { orderId: order.id, paymentId: paidPayment.id },
      });
      return order;
    } catch (error) {
      this.logger.error(
        {
          subscriptionId: sub.id,
          paymentId: paidPayment.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to create order from subscription payment (payment remains PAID)',
      );
      return null;
    }
  }

  private async attemptAutopay(
    sub: UserProductSubscriptionEntity,
    cycle: { id: string; pricingSnapshot?: Record<string, unknown> | null },
    mandateId: string,
    amount: string,
    billingCycleRef: string,
    scheduledDebitAt?: Date,
  ): Promise<boolean> {
    let mandate = await this.mandateService.getForSubscription(sub.id);
    if (!mandate) return false;
    if (!mandate.gatewayMandateId && mandate.authorizationOrderId) {
      try {
        await this.mandateService.confirmFromAuthorizationPayment({
          gatewayOrderId: mandate.authorizationOrderId,
          gatewayPaymentId: mandate.authorizationPaymentId,
          actor: 'scheduler',
        });
      } catch (error) {
        this.logger.warn(
          {
            subscriptionId: sub.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'AutoPay mandate was not confirmed from the first payment',
        );
      }
      mandate = (await this.mandateService.getForSubscription(sub.id)) ?? mandate;
    }
    const provider = this.mandateService.resolveChargeProvider(sub);
    if (!provider || provider !== mandate.provider) {
      this.logger.warn(
        { subscriptionId: sub.id, stored: sub.paymentGateway, mandate: mandate.provider },
        'Refusing to charge a mandate through a different provider',
      );
      return false;
    }
    if (provider === SubscriptionMandateProvider.RAZORPAY && !mandate.gatewayMandateId) {
      this.logger.warn(
        { subscriptionId: sub.id },
        'AutoPay is on but Razorpay has no token yet, so the debit was not sent',
      );
      return false;
    }
    const user = await this.usersRepository.findById(sub.userId);
    const idempotencyKey = `sub:${sub.id}:cycle:${billingCycleRef}:autopay`;
    const payment = await this.paymentsService.upsertPendingCycle({
      subscriptionId: sub.id,
      userId: sub.userId,
      billingCycleRef,
      amount,
      billingDate: scheduledDebitAt ?? new Date(),
      actor: 'scheduler',
    });
    if (payment.status === SubscriptionPaymentStatus.PAID) return true;
    if (payment.status === SubscriptionPaymentStatus.RECONCILING) {
      this.logger.warn(
        { subscriptionId: sub.id, billingCycleRef, paymentId: payment.id },
        'Cycle payment is reconciling — AutoPay CHARGE was not sent again',
      );
      return true;
    }
    const priorAutopayCharge =
      payment.attemptKind === SubscriptionPaymentAttemptKind.AUTOPAY &&
      Boolean(payment.gatewayOrderId || payment.gatewayPaymentId);
    if (priorAutopayCharge) {
      this.logger.warn(
        { subscriptionId: sub.id, billingCycleRef, paymentId: payment.id },
        'Cycle already has an AutoPay gateway payment id, so CHARGE was not sent again',
      );
      return true;
    }
    await this.paymentsService.attachCycleMetadata(payment.id, {
      billingCycleId: cycle.id,
      attemptKind: SubscriptionPaymentAttemptKind.AUTOPAY,
      idempotencyKey,
      actor: 'scheduler',
    });
    const mandateMethod = String(mandate.consentEvidence?.method ?? '');
    const cashfreeCard =
      provider === SubscriptionMandateProvider.CASHFREE &&
      (mandateMethod === 'card' || mandateMethod === 'emandate');
    const cashfreeUpi = provider === SubscriptionMandateProvider.CASHFREE && !cashfreeCard;
    let scheduleDate: Date | undefined;
    if (provider === SubscriptionMandateProvider.CASHFREE) {
      if (isCashfreeAdvanceChargeEnabled(this.nestConfig)) {
        if (scheduledDebitAt) {
          scheduleDate = scheduledDebitAt;
        } else {
          const intended = sub.nextBillingDate;
          if (!intended) return false;
          const decision = resolveCashfreeChargeSchedule({
            intended,
            method: mandateMethod,
          });
          if (decision.outcome === 'schedule') {
            scheduleDate = decision.scheduleDate;
          } else if (decision.outcome === 'wait') {
            return false;
          } else {
            scheduleDate = nextLegalCashfreeChargeDate({ method: mandateMethod });
          }
        }
      } else if (cashfreeCard) {
        // Same-day / T+1 card SI is not allowed; use earliest safe T+2 IST slot.
        scheduleDate = nextCashfreeCardScheduleDate();
      } else if (cashfreeUpi) {
        scheduleDate = nextCashfreeUpiScheduleDate();
      }
    }
    const upiRenewal =
      provider === SubscriptionMandateProvider.RAZORPAY &&
      mandateMethod !== 'card' &&
      mandateMethod !== 'emandate';
    const debitAt = upiRenewal
      ? scheduledDebitAt ??
        razorpayUpiDebitAt({
          now: new Date(),
          keyId: this.nestConfig.get<string>('RAZORPAY_KEY_ID') ?? '',
          allowShortWindow:
            isSubscriptionTestTenuresEnabled(this.nestConfig) &&
            TEST_PRODUCT_FREQUENCIES.has(sub.frequency),
        })
      : undefined;
    const notifyOnly = Boolean(debitAt && debitAt.getTime() > Date.now());
    await this.billingCycleService.updateById(cycle.id, {
      ...(notifyOnly
        ? {}
        : {
            status: SubscriptionBillingCycleStatus.DEBIT_PENDING,
            processingStartedAt: new Date(),
          }),
      paymentId: payment.id,
      updatedBy: 'scheduler',
    });
    let result: Awaited<ReturnType<ReturnType<SubscriptionMandateService['adapter']>['charge']>>;
    try {
      result = await this.lockService.withDbLock(`upi-debit:${sub.id}:${billingCycleRef}`, () =>
        this.mandateService.adapter(provider).charge({
        gatewayCustomerId: mandate.gatewayCustomerId ?? '',
        gatewayMandateId: mandate.gatewayMandateId ?? '',
        gatewaySubscriptionId:
          provider === SubscriptionMandateProvider.CASHFREE
            ? resolveCashfreeMerchantSubscriptionId(
                mandate.authorizationOrderId,
                mandate.gatewaySubscriptionId,
              )
            : mandate.gatewaySubscriptionId,
        amount,
        receipt: payment.refId,
        idempotencyKey,
        debitAt,
        scheduleDate,
        customer: { email: user?.email, phone: user?.mobileNumber ?? '' },
        notes: buildSubscriptionGatewayNotes({
          paymentPurpose: SUBSCRIPTION_PAYMENT_PURPOSE.PRODUCT_SUBSCRIPTION,
          billingCycleRef,
          subscriptionId: sub.id,
          subscriptionPaymentId: payment.id,
          userId: sub.userId,
          productId: sub.productId,
        }),
      }),
      );
      this.logAutopayTrace('cashfree_charge_result', {
        subscriptionId: sub.id,
        refId: sub.refId,
        frequency: sub.frequency,
        billingCycleRef,
        liveAmount: amount,
        provider,
        method: mandateMethod,
        accepted: result.accepted,
        pending: result.pending,
        gatewayOrderId: result.gatewayOrderId ?? null,
        gatewayPaymentId: result.gatewayPaymentId ?? null,
        failureReason: result.failureReason ?? null,
        scheduleIst: formatIstDate(scheduleDate ?? debitAt ?? scheduledDebitAt ?? null),
        nextBillingIst: formatIstDate(sub.nextBillingDate),
        nowIst: formatIstDate(new Date()),
        merchantSubscriptionId:
          provider === SubscriptionMandateProvider.CASHFREE
            ? resolveCashfreeMerchantSubscriptionId(
                mandate.authorizationOrderId,
                mandate.gatewaySubscriptionId,
              )
            : mandate.gatewaySubscriptionId,
      });
    } catch (error) {
      this.logger.warn(
        {
          event: AUTOPAY_TRACE,
          phase: 'cashfree_charge_unknown',
          subscriptionId: sub.id,
          refId: sub.refId,
          frequency: sub.frequency,
          billingCycleRef,
          liveAmount: amount,
          scheduleIst: formatIstDate(scheduleDate ?? debitAt ?? scheduledDebitAt ?? null),
          nowIst: formatIstDate(new Date()),
          error: error instanceof Error ? error.message : String(error),
        },
        `${AUTOPAY_TRACE} AutoPay charge outcome is unknown, so no second charge was created`,
      );
      return true;
    }
    const chargeMetadata =
      provider === SubscriptionMandateProvider.CASHFREE
        ? {
            cashfreeCharge: cashfreeChargeAttemptMetadata({
              raw: result.raw,
              scheduleDate,
              accepted: result.accepted,
              pending: result.pending,
              failureReason: result.failureReason,
            }),
          }
        : undefined;
    if (result.gatewayOrderId || chargeMetadata) {
      await this.paymentsService.recordProviderCharge(payment.id, {
        gatewayOrderId: result.gatewayOrderId,
        gatewayPaymentId: result.gatewayPaymentId,
        paymentGateway: provider,
        pending: Boolean(result.pending || notifyOnly),
        actor: 'scheduler',
        metadata: chargeMetadata,
      });
    }
    if (result.accepted || result.pending) {
      await this.billingCycleService.updateById(cycle.id, {
        pricingSnapshot: {
          ...(cycle.pricingSnapshot ?? {}),
          lockedAt: new Date().toISOString(),
          scheduledDebitDate: (scheduleDate ?? debitAt)?.toISOString() ?? null,
          gatewayPaymentId: result.gatewayPaymentId ?? null,
          gatewayOrderId: result.gatewayOrderId ?? null,
        },
        updatedBy: 'scheduler',
      });
    }
    if (notifyOnly) {
      if (result.pending && result.gatewayOrderId) {
        await this.billingCycleService.updateById(cycle.id, {
          status: SubscriptionBillingCycleStatus.NOTIFICATION_SENT,
          paymentId: payment.id,
          notificationSentAt: new Date(),
          debitEarliestAt: debitAt,
          updatedBy: 'scheduler',
        });
      }
      return true;
    }
    if (result.pending) {
      const debitEarliestAt =
        provider === SubscriptionMandateProvider.CASHFREE
          ? scheduleDate ?? nextCashfreeUpiScheduleDate()
          : debitAt ?? null;
      if (debitEarliestAt) {
        await this.billingCycleService.updateById(cycle.id, {
          debitEarliestAt,
          updatedBy: 'scheduler',
        });
      }
      if (!result.gatewayOrderId) await this.paymentsService.markReconciling(payment.id, 'scheduler');
      return true;
    }
    if (result.accepted && result.gatewayOrderId) {
      await this.paymentsService.attachPaymentLink(payment.id, {
        paymentLink: null,
        gatewayOrderId: result.gatewayOrderId,
        paymentGateway: provider,
        actor: 'scheduler',
      });
      if (!result.pending && result.gatewayPaymentId) {
        await this.handlePaymentSuccess({
          paymentId: payment.id,
          gatewayOrderId: result.gatewayOrderId,
          gatewayPaymentId: result.gatewayPaymentId,
          actor: 'scheduler-autopay',
        });
      }
      return true;
    }
    await this.paymentsService.markFailed(payment.id, result.failureReason ?? 'AutoPay declined', 'scheduler');
    await this.billingCycleService.updateById(cycle.id, {
      status: SubscriptionBillingCycleStatus.FAILED,
      failureReason: result.failureReason ?? 'AutoPay declined',
      updatedBy: 'scheduler',
    });
    return false;
  }

  private async assertNotInFlight(sub: UserProductSubscriptionEntity, action: string): Promise<void> {
    if (!sub.nextBillingDate) return;
    const cycle = await this.billingCycleService.findBySubscriptionId(sub.id).then((rows) =>
      rows.find((row) => row.billingCycleRef === buildBillingCycleRef(sub.nextBillingDate as Date, sub.frequency)),
    );
    if (cycle && isCycleInFlight(cycle.status)) {
      throw new BadRequestException({
        code: SUBSCRIPTION_ERROR.CHANGE_CUTOFF,
        message: `Cannot ${action} while the current cycle is already being billed or fulfilled`,
      });
    }
    const cutoffHours = sub.config?.changeCutoffHours ?? this.nestConfig.get<number>('subscriptions.changeCutoffHours') ?? 12;
    if (isChangeCutoffReached({ chargeDate: sub.nextBillingDate, asOfDate: new Date(), cutoffHours })) {
      throw new BadRequestException({
        code: SUBSCRIPTION_ERROR.CHANGE_CUTOFF,
        message: `Cannot ${action} within ${cutoffHours} hours of the next charge`,
      });
    }
  }

  private async requireAdminSubscription(idOrRefId: string) {
    const sub = await this.subscriptionsRepository.findByIdOrRefId(idOrRefId);
    if (!sub) throw new NotFoundException('Subscription not found');
    return sub;
  }

  private isAutopayCollectionInFlight(
    cycle: { status: string },
    payment?: {
      status: string;
      attemptKind?: string | null;
      gatewayOrderId?: string | null;
      gatewayPaymentId?: string | null;
    } | null,
  ): boolean {
    if (
      cycle.status === SubscriptionBillingCycleStatus.DEBIT_PENDING ||
      cycle.status === SubscriptionBillingCycleStatus.NOTIFICATION_SENT
    ) {
      return true;
    }
    if (!payment) return false;
    if (payment.status === SubscriptionPaymentStatus.RECONCILING) return true;
    return (
      payment.attemptKind === SubscriptionPaymentAttemptKind.AUTOPAY &&
      payment.status !== SubscriptionPaymentStatus.FAILED &&
      Boolean(payment.gatewayOrderId || payment.gatewayPaymentId)
    );
  }

  private isEarlyPaymentEligible(
    cycle: { status: string },
    payment?: {
      status: string;
      attemptKind?: string | null;
      gatewayOrderId?: string | null;
      gatewayPaymentId?: string | null;
      paymentLink?: string | null;
    } | null,
  ): boolean {
    if (
      cycle.status === SubscriptionBillingCycleStatus.PAID ||
      cycle.status === SubscriptionBillingCycleStatus.PAID_ORDER_PENDING ||
      cycle.status === SubscriptionBillingCycleStatus.SKIPPED ||
      cycle.status === SubscriptionBillingCycleStatus.DEBIT_PENDING
    ) {
      return false;
    }
    if (payment?.status === SubscriptionPaymentStatus.PAID) return false;
    if (this.isAutopayCollectionInFlight(cycle, payment)) return false;
    return true;
  }

  private async ensureUpcomingBillingCycle(
    sub: UserProductSubscriptionEntity,
    actor: string,
  ): Promise<SubscriptionBillingCycleEntity | null> {
    if (!sub.nextBillingDate) return null;
    if (
      ![
        ProductSubscriptionStatus.ACTIVE,
        ProductSubscriptionStatus.RENEWAL_PAYMENT_PENDING,
        ProductSubscriptionStatus.PAST_DUE,
      ].includes(sub.status)
    ) {
      return null;
    }
    let quote: SubscriptionRenewalQuote;
    try {
      quote = await this.quoteRenewal(sub);
    } catch {
      return null;
    }
    const deliveryLead = sub.config?.deliveryLeadDays ?? 2;
    const billingCycleRef = buildBillingCycleRef(sub.nextBillingDate, sub.frequency);
    return this.billingCycleService.getOrCreate({
      subscriptionId: sub.id,
      userId: sub.userId,
      billingCycleRef,
      sequence: (sub.billingCycleSequence ?? 0) + 1,
      chargeDate: sub.nextBillingDate,
      estimatedDeliveryDate: getEstimatedDeliveryDate(sub.nextBillingDate, deliveryLead),
      amount: quote.finalAmount,
      pricingSnapshot: buildRenewalPricingSnapshot(quote, { frequency: sub.frequency }),
      actor,
    });
  }

  /**
   * Creates or reuses a MANUAL_LINK checkout for the upcoming cycle on the
   * subscription's stored paymentGateway. Does not create a second mandate.
   */
  private async ensureEarlyPaymentLink(
    sub: UserProductSubscriptionEntity,
    cycle: SubscriptionBillingCycleEntity,
    actor: string,
  ): Promise<Awaited<ReturnType<SubscriptionPaymentLinkService['createPaymentLink']>> | null> {
    const existingPayment = cycle.paymentId
      ? await this.paymentsService.findById(cycle.paymentId)
      : (await this.paymentsService.findBySubscriptionId(sub.id)).find(
          (row) => row.billingCycleRef === cycle.billingCycleRef,
        );
    if (!this.isEarlyPaymentEligible(cycle, existingPayment)) return null;

    if (
      existingPayment &&
      existingPayment.status === SubscriptionPaymentStatus.LINK_GENERATED &&
      existingPayment.attemptKind !== SubscriptionPaymentAttemptKind.AUTOPAY &&
      (existingPayment.paymentLink || existingPayment.gatewayOrderId) &&
      !this.isStaleCashfreeCheckout(existingPayment)
    ) {
      return {
        paymentLink: existingPayment.paymentLink,
        gatewayOrderId: existingPayment.gatewayOrderId ?? existingPayment.refId,
        paymentGateway: existingPayment.paymentGateway ?? sub.paymentGateway ?? 'CASHFREE',
        currency: existingPayment.currency,
        razorpayOrderId:
          (existingPayment.paymentGateway ?? '').toUpperCase() === 'RAZORPAY'
            ? existingPayment.gatewayOrderId
            : null,
        paymentSessionId: paymentSessionIdFromLink(existingPayment.paymentLink),
        customer: { name: '', email: '', contact: '' },
      };
    }

    const amount = cycle.amount || (await this.recalculateAmount(sub));
    const payment = await this.paymentsService.upsertPendingCycle({
      subscriptionId: sub.id,
      userId: sub.userId,
      billingCycleRef: cycle.billingCycleRef,
      amount,
      billingDate: cycle.chargeDate,
      actor,
    });
    if (payment.status === SubscriptionPaymentStatus.PAID) return null;
    if (payment.status === SubscriptionPaymentStatus.RECONCILING) return null;

    await this.paymentsService.attachCycleMetadata(payment.id, {
      billingCycleId: cycle.id,
      attemptKind: SubscriptionPaymentAttemptKind.MANUAL_LINK,
      idempotencyKey: `sub:${sub.id}:cycle:${cycle.billingCycleRef}:early`,
      actor,
    });

    if (
      payment.status === SubscriptionPaymentStatus.LINK_GENERATED &&
      payment.attemptKind !== SubscriptionPaymentAttemptKind.AUTOPAY &&
      (payment.paymentLink || payment.gatewayOrderId) &&
      !this.isStaleCashfreeCheckout(payment)
    ) {
      await this.billingCycleService.updateById(cycle.id, {
        status: SubscriptionBillingCycleStatus.LINK_GENERATED,
        paymentId: payment.id,
        updatedBy: actor,
      });
      return {
        paymentLink: payment.paymentLink,
        gatewayOrderId: payment.gatewayOrderId ?? payment.refId,
        paymentGateway: payment.paymentGateway ?? sub.paymentGateway ?? 'CASHFREE',
        currency: payment.currency,
        razorpayOrderId:
          (payment.paymentGateway ?? '').toUpperCase() === 'RAZORPAY' ? payment.gatewayOrderId : null,
        paymentSessionId: paymentSessionIdFromLink(payment.paymentLink),
        customer: { name: '', email: '', contact: '' },
      };
    }

    const user = await this.usersRepository.findById(sub.userId);
    const persistedGateway = (sub.paymentGateway ?? '').toUpperCase();
    const link = await this.paymentLinkService.createPaymentLink({
      amount,
      referenceId: this.nextCashfreeOrderId(payment.refId),
      preferredGateway:
        persistedGateway === 'RAZORPAY' || persistedGateway === 'CASHFREE'
          ? persistedGateway
          : null,
      customer: {
        id: sub.userId,
        name: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || undefined,
        email: user?.email,
        phone: user?.mobileNumber ?? '',
      },
      notes: buildSubscriptionGatewayNotes({
        paymentPurpose: SUBSCRIPTION_PAYMENT_PURPOSE.PRODUCT_SUBSCRIPTION,
        billingCycleRef: cycle.billingCycleRef,
        subscriptionId: sub.id,
        subscriptionPaymentId: payment.id,
        userId: sub.userId,
        productId: sub.productId,
      }),
      description: `Early renewal ${sub.refId}`,
    });

    await this.paymentsService.attachPaymentLink(payment.id, {
      paymentLink: link.paymentLink ?? '',
      gatewayOrderId: link.gatewayOrderId,
      paymentGateway: link.paymentGateway,
      actor,
    });
    await this.billingCycleService.updateById(cycle.id, {
      status: SubscriptionBillingCycleStatus.LINK_GENERATED,
      paymentId: payment.id,
      updatedBy: actor,
    });
    return link;
  }

  private async assertEligibleProduct(
    productId: string,
    productVariantId: string,
    frequency: import('../enums/product-subscription-frequency.enum').ProductSubscriptionFrequency,
  ) {
    const product = await this.productsRepository.findPublishedById(productId);
    if (!product || product.status !== ProductStatus.PUBLISHED) {
      throw new BadRequestException('Product is not available for subscription');
    }
    const variant = await this.variantsRepository.findById(productVariantId);
    if (!variant || variant.productId !== productId || variant.status !== VariantStatus.ACTIVE) {
      throw new BadRequestException('Product variant is not available for subscription');
    }
    const config = await this.configService.findEntityForProductVariant(productId, productVariantId);
    if (!config || !config.enabled) {
      throw new BadRequestException('Subscription config is not enabled');
    }
    if (!config.frequencies.includes(frequency)) {
      throw new BadRequestException('Selected frequency is not allowed for this product');
    }
    assertProductFrequenciesAllowed(this.nestConfig, [frequency]);
    return { product, variant, config };
  }

  private async cashfreeAuthorizationInProgress(subscriptionId: string): Promise<boolean> {
    const sub = await this.subscriptionsRepository.findById(subscriptionId);
    if ((sub?.paymentGateway ?? '').toUpperCase() !== 'CASHFREE') return false;
    const payments = await this.paymentsService.findBySubscriptionId(subscriptionId);
    return payments.some(
      (payment) =>
        payment.status === SubscriptionPaymentStatus.LINK_GENERATED &&
        (payment.paymentGateway ?? '').toUpperCase() === 'CASHFREE',
    );
  }

  private async reuseCashfreeCheckout(userId: string, subscriptionId: string) {
    const sub = await this.subscriptionsRepository.findByIdAndUserId(subscriptionId, userId);
    if (!sub) throw new NotFoundException('Subscription not found');
    const payments = await this.paymentsService.findBySubscriptionId(subscriptionId);
    const open = payments.find(
      (payment) => payment.status === SubscriptionPaymentStatus.LINK_GENERATED,
    );
    const paymentLink = open?.paymentLink ?? null;
    return this.mapOwned(sub, {
      paymentLink,
      paymentSessionId: paymentSessionIdFromLink(paymentLink),
      subscriptionCheckout: Boolean(paymentLink?.includes('subscription_session_id')),
      currency: open?.currency ?? null,
      environment: paymentLink?.includes('sandbox') ? 'sandbox' : 'production',
    });
  }

  /** Cashfree sessions expire in minutes unless we set order_expiry_time. Old /order/ URLs also 404. */
  private isStaleCashfreeCheckout(payment: {
    paymentGateway?: string | null;
    paymentLink?: string | null;
    createdAt?: Date | string;
    refId?: string;
    amount?: string;
    id?: string;
  }): boolean {
    const gateway = (payment.paymentGateway ?? '').toUpperCase();
    if (gateway && gateway !== 'CASHFREE') return false;
    const link = payment.paymentLink ?? '';
    if (link.includes('/order/')) return true;
    if (/cashfree\.com\/pg\/view\/checkout/.test(link)) return true;
    const createdAt = payment.createdAt ? new Date(payment.createdAt) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) return false;
    return Date.now() - createdAt.getTime() > 30 * 60 * 1000;
  }

  private nextCashfreeOrderId(refId: string): string {
    return `${refId}-${Date.now()}`.slice(0, 45);
  }

  private async refreshCashfreeCheckoutSession(
    sub: UserProductSubscriptionEntity,
    payment: { id: string; refId: string; amount: string; billingCycleRef?: string },
    actor: string,
  ): Promise<Awaited<ReturnType<SubscriptionPaymentLinkService['createPaymentLink']>> | null> {
    const user = await this.usersRepository.findById(sub.userId);
    const persistedGateway = (sub.paymentGateway ?? '').toUpperCase();
    const link = await this.paymentLinkService.createPaymentLink({
      amount: payment.amount,
      referenceId: this.nextCashfreeOrderId(payment.refId),
      preferredGateway:
        persistedGateway === 'RAZORPAY' || persistedGateway === 'CASHFREE'
          ? persistedGateway
          : null,
      customer: {
        id: sub.userId,
        name: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || undefined,
        email: user?.email,
        phone: user?.mobileNumber ?? '',
      },
      notes: buildSubscriptionGatewayNotes({
        paymentPurpose: SUBSCRIPTION_PAYMENT_PURPOSE.PRODUCT_SUBSCRIPTION,
        billingCycleRef: payment.billingCycleRef ?? '',
        subscriptionId: sub.id,
        subscriptionPaymentId: payment.id,
        userId: sub.userId,
        productId: sub.productId,
      }),
    });
    await this.paymentsService.attachPaymentLink(payment.id, {
      paymentLink: link.paymentLink ?? '',
      gatewayOrderId: link.gatewayOrderId,
      paymentGateway: link.paymentGateway,
      actor,
    });
    return link;
  }

  private async runIsolatedSubscriptionPass(
    subscriptionId: string,
    phase: string,
    work: () => Promise<void>,
  ): Promise<boolean> {
    try {
      const cycleLock = await this.lockService.withLock(
        `renewal:${subscriptionId}`,
        work,
        120_000,
      );
      return cycleLock !== null;
    } catch (error) {
      this.logger.error(
        {
          subscriptionId,
          phase,
          error: error instanceof Error ? error.message : String(error),
        },
        'Product subscription renewal skipped this subscription after an error',
      );
      return false;
    }
  }

  private async mapOwned(
    entity: UserProductSubscriptionEntity,
    extras?: Parameters<typeof mapUserProductSubscriptionToResponse>[1],
  ) {
    const [mapped] = await this.mapSubscriptionsWithRelations([entity], { extras });
    return mapped;
  }
}
