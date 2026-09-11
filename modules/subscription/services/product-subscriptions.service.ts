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
import { UserProductSubscriptionEntity } from '../entities/user-product-subscription.entity';
import { SubscriptionBillingCycleStatus } from '../enums/subscription-billing-cycle-status.enum';
import { SubscriptionHistoryAction } from '../enums/subscription-history-action.enum';
import { SubscriptionMissedPaymentAction } from '../enums/subscription-missed-payment-action.enum';
import { SubscriptionPaymentAttemptKind } from '../enums/subscription-payment-attempt-kind.enum';
import { SubscriptionPaymentStatus } from '../enums/subscription-payment-status.enum';
import { SubscriptionRenewalMethod } from '../enums/subscription-renewal-method.enum';
import { SUBSCRIPTION_ERROR } from '../constants/subscription.constants';
import { SUBSCRIPTION_PAYMENT_PURPOSE } from '../constants/subscription-payment-purpose.constants';
import { mapUserProductSubscriptionToResponse } from '../mappers/product-subscription.mapper';
import { checkoutExtrasFromLink } from '../utils/checkout-extras.util';
import { UserProductSubscriptionsRepository } from '../repositories/user-product-subscriptions.repository';
import { SubscriptionStatusHistoryRepository } from '../repositories/subscription-status-history.repository';
import { buildBillingCycleRef } from '../utils/billing-cycle-ref.util';
import { isAmountWithinMandateLimit, resolveMandateMaxAmount } from '../utils/mandate-amount.util';
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
import { buildSubscriptionGatewayNotes } from '../utils/subscription-gateway-notes.util';
import { MembershipBenefitsApplicationService } from './membership-benefits-application.service';
import { ProductSubscriptionConfigService } from './product-subscription-config.service';
import { ProductSubscriptionPaymentsService } from './product-subscription-payments.service';
import { ProductSubscriptionPricingService } from './product-subscription-pricing.service';
import { SubscriptionBillingCycleService } from './subscription-billing-cycle.service';
import { SubscriptionLockService } from './subscription-lock.service';
import { SubscriptionMandateService } from './subscription-mandate.service';
import { SubscriptionNotificationsService } from './subscription-notifications.service';
import { SubscriptionPaymentLinkService } from './subscription-payment-link.service';
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
  ) {}

  async getConfig(query: ProductSubscriptionConfigQueryDto) {
    const config = await this.configService.findForProductVariant(
      query.productId,
      query.productVariantId ?? null,
    );
    if (!config || !config.enabled) {
      return null;
    }
    const autopayFeatureEnabled = this.mandateService.isAutopayFeatureEnabled();
    const mandateMaxConfigured = Boolean(config.mandateMaxAmount);
    const autopayAvailable = autopayFeatureEnabled && mandateMaxConfigured;
    return {
      ...config,
      intervalLabels: (config.frequencies ?? []).map((frequency) => ({
        frequency,
        intervalMonths: { MONTHLY: 1, BI_MONTHLY: 2, QUARTERLY: 3 }[frequency],
        label:
          frequency === 'BI_MONTHLY'
            ? 'Every 2 months'
            : frequency === 'QUARTERLY'
              ? 'Every 3 months'
              : 'Every month',
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
    return {
      productId: product.id,
      productVariantId: variant.id,
      quantity: dto.quantity,
      frequency: dto.frequency,
      intervalMonths: dto.frequency === 'BI_MONTHLY' ? 2 : dto.frequency === 'QUARTERLY' ? 3 : 1,
      intervalLabel:
        dto.frequency === 'BI_MONTHLY'
          ? 'Every 2 months'
          : dto.frequency === 'QUARTERLY'
            ? 'Every 3 months'
            : 'Every month',
      catalogUnitPrice: Number(variant.sellingPrice).toFixed(2),
      ...pricing,
      memberDiscountApplied: !!memberDiscount,
      mixedCart: {
        supported: true,
        behavior:
          'One-time and Subscribe & Save items may share a cart. Subscription discount applies only to subscription lines. First payment uses existing GoKwik or native checkout. The paid order is created once; each subscription line is activated afterwards.',
      },
      firstPayment: {
        routedThroughExistingCheckout: true,
        isMandateAuthorization: false,
      },
      autopay: {
        enabled: this.mandateService.isAutopayFeatureEnabled(),
        ready: false,
        requiresSeparateMandateSetup: true,
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
    const billingCycleRef = buildBillingCycleRef(billingDate);
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
    const link = await this.paymentLinkService.createPaymentLink({
      amount: pricing.finalAmount,
      currency: 'INR',
      referenceId: payment.refId,
      customer: {
        id: userId,
        name: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || undefined,
        email: user?.email,
        phone: user?.mobileNumber ?? '',
      },
      notes: buildSubscriptionGatewayNotes({
        paymentPurpose: SUBSCRIPTION_PAYMENT_PURPOSE.PRODUCT_SUBSCRIPTION,
        billingCycleRef,
        subscriptionId: subscription.id,
        subscriptionPaymentId: payment.id,
        userId,
        productId: dto.productId,
      }),
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

      const billingCycleRef = buildBillingCycleRef(now);
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
    return {
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async getMine(userId: string, id: string) {
    const sub = await this.subscriptionsRepository.findByIdAndUserId(id, userId);
    if (!sub) throw new NotFoundException('Subscription not found');
    const [mapped] = await this.mapSubscriptionsWithRelations([sub]);
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
    await this.subscriptionsRepository.updateById(id, {
      status: ProductSubscriptionStatus.CANCELLED,
      cancellationDate: new Date(),
      cancellationReason: reason ?? null,
      autopayReady: false,
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
    const skippedRef = buildBillingCycleRef(from);
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

    const billingDate = sub.nextBillingDate ?? new Date();
    const billingCycleRef = buildBillingCycleRef(billingDate);
    const amount = await this.recalculateAmount(sub);
    const payment = await this.paymentsService.upsertPendingCycle({
      subscriptionId: sub.id,
      userId,
      billingCycleRef,
      amount,
      billingDate,
      actor: userId,
    });

    if (payment.status === SubscriptionPaymentStatus.PAID) {
      return this.mapOwned(sub);
    }

    const user = await this.usersRepository.findById(userId);
    const link = await this.paymentLinkService.createPaymentLink({
      amount,
      referenceId: `${payment.refId}-R${payment.retryCount + 1}`.slice(0, 40),
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
        subscriptionPaymentId: payment.id,
        userId,
        productId: sub.productId,
      }),
    });

    await this.paymentsService.attachPaymentLink(payment.id, {
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

    await this.handlePaymentSuccess({
      paymentId: payment.id,
      gatewayOrderId: dto.razorpay_order_id,
      gatewayPaymentId: dto.razorpay_payment_id,
      actor: userId,
    });

    return this.getMine(userId, subscriptionId);
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
    const cycles = await this.billingCycleService.findBySubscriptionId(subscriptionId);
    return cycles.map((cycle) => ({
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
    }));
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
    const storefront = this.nestConfig.get<string>('STOREFRONT_URL')?.replace(/\/+$/, '');
    const { mandate, session } = await this.mandateService.startAuthorization({
      subscription: sub,
      customer: {
        name: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || undefined,
        email: user?.email,
        phone: user?.mobileNumber ?? '',
      },
      actor: userId,
      returnUrl: storefront ? `${storefront}/account/subscriptions/${sub.id}/mandate` : undefined,
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
      gatewaySubscriptionId: mandate.gatewaySubscriptionId,
      gatewayPaymentId: mandate.authorizationPaymentId,
      gatewayCustomerId: mandate.gatewayCustomerId,
    });
    await this.mandateService.applyStatusSnapshot({
      mandateId: mandate.id,
      status: snapshot.status,
      gatewayMandateId: snapshot.gatewayMandateId,
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
    return this.retryPayment(userId, subscriptionId);
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

    const { payment: paidPayment, newlyPaid } = await this.paymentsService.markPaidIdempotent(
      payment.id,
      { gatewayPaymentId: params.gatewayPaymentId, actor: params.actor },
    );
    if (!newlyPaid) return;

    const sub = await this.subscriptionsRepository.findById(paidPayment.subscriptionId);
    if (!sub) {
      this.logger.error({ paymentId: paidPayment.id }, 'Subscription missing after payment');
      return;
    }

    const now = new Date();
    const timezone = sub.timezone || 'Asia/Kolkata';
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
    if (order && paidPayment.billingCycleId) {
      await this.billingCycleService.updateById(paidPayment.billingCycleId, {
        status: SubscriptionBillingCycleStatus.PAID,
        orderId: order.id,
        updatedBy: params.actor ?? 'webhook',
      });
    }

    this.notificationsService.notifyActivated({
      userId: sub.userId,
      kind: 'product_subscription',
      refId: sub.refId,
    });
  }

  async processRenewals(asOfDate = new Date()): Promise<number> {
    const lock = await this.lockService.acquire('product-renewal-run', 10 * 60 * 1000);
    if (!lock) {
      this.logger.warn('Skipping product subscription renewal — another worker holds the lock');
      return 0;
    }
    try {
      await this.finalizePaidCycles(asOfDate);
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
        const cycleLock = await this.lockService.withLock(
          `renewal:${sub.id}`,
          async () => {
            await this.processSingleRenewal(sub.id, asOfDate);
          },
          120_000,
        );
        if (cycleLock !== null) processed += 1;
      }
      return processed;
    } finally {
      await this.lockService.release('product-renewal-run');
    }
  }

  async processGraceAndExpiry(asOfDate = new Date()): Promise<number> {
    const pastDue = await this.subscriptionsRepository.findDueForRenewal(
      [ProductSubscriptionStatus.RENEWAL_PAYMENT_PENDING, ProductSubscriptionStatus.PAST_DUE],
      asOfDate,
    );
    let updated = 0;
    for (const sub of pastDue) {
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
      const offsets = sub.config?.reminderOffsetsJson ?? [7, 2, 0];
      const daysUntil = Math.round(
        (sub.nextBillingDate.getTime() - asOfDate.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (!offsets.includes(daysUntil)) continue;
      const cycleRef = buildBillingCycleRef(sub.nextBillingDate);
      const payment = await this.paymentsService
        .findBySubscriptionId(sub.id)
        .then((rows) => rows.find((p) => p.billingCycleRef === cycleRef));
      this.notificationsService.notifyReminder({
        userId: sub.userId,
        kind: 'product_subscription',
        paymentLink: payment?.paymentLink,
        daysBefore: daysUntil,
        refId: sub.refId,
      });
      sent += 1;
    }
    return sent;
  }

  private async processSingleRenewal(subscriptionId: string, asOfDate: Date): Promise<void> {
    const sub = await this.subscriptionsRepository.findById(subscriptionId);
    if (!sub || !sub.nextBillingDate) return;
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

    const billingCycleRef = buildBillingCycleRef(chargeDate);
    let amount: string;
    try {
      amount = await this.recalculateAmount(sub);
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
      amount,
      pricingSnapshot: { amount, quantity: sub.quantity, frequency: sub.frequency },
      actor: 'scheduler',
    });
    if (
      cycle.status === SubscriptionBillingCycleStatus.PAID ||
      cycle.status === SubscriptionBillingCycleStatus.PAID_ORDER_PENDING ||
      cycle.status === SubscriptionBillingCycleStatus.SKIPPED ||
      cycle.status === SubscriptionBillingCycleStatus.DEBIT_PENDING
    ) {
      return;
    }

    const mandate = await this.mandateService.getForSubscription(sub.id);
    const autopay = this.mandateService.canPresentAsAutopay(sub, mandate);
    if (autopay && mandate) {
      if (!isAmountWithinMandateLimit(amount, mandate.maxAmount)) {
        this.logger.warn(
          { subscriptionId: sub.id, amount, maxAmount: mandate.maxAmount },
          'Cycle amount exceeds mandate limit — falling back to manual payment',
        );
      } else {
        const charged = await this.attemptAutopay(sub, cycle, mandate.id, amount, billingCycleRef);
        if (charged) return;
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
    const persistedGateway = (sub.paymentGateway ?? '').toLowerCase();
    const link = await this.paymentLinkService.createPaymentLink({
      amount,
      referenceId: payment.refId,
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
      paymentGateway: persistedGateway === 'razorpay' || persistedGateway === 'cashfree'
        ? sub.paymentGateway!
        : link.paymentGateway,
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

  private async recalculateAmount(sub: {
    productVariantId: string;
    quantity: number;
    discountType: import('../enums/subscription-discount-type.enum').SubscriptionDiscountType;
    discountValue: string;
    userId: string;
  }): Promise<string> {
    const variant = await this.variantsRepository.findById(sub.productVariantId);
    if (!variant) throw new BadRequestException('Variant not found for renewal pricing');
    const memberDiscount = await this.membershipBenefits.getMemberDiscount(sub.userId);
    return this.pricingService.calculate(
      variant.sellingPrice,
      sub.quantity,
      sub.discountType,
      sub.discountValue,
      memberDiscount,
    ).finalAmount;
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
    await this.paymentsService.markFailed(
      payment.id,
      params.reason ?? 'Provider reported failure',
      params.actor ?? 'webhook',
    );
    if (payment.billingCycleId) {
      await this.billingCycleService.updateById(payment.billingCycleId, {
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
    cycle: { id: string },
    mandateId: string,
    amount: string,
    billingCycleRef: string,
  ): Promise<boolean> {
    const mandate = await this.mandateService.getForSubscription(sub.id);
    if (!mandate) return false;
    const provider = this.mandateService.resolveChargeProvider(sub);
    if (!provider || provider !== mandate.provider) {
      this.logger.warn(
        { subscriptionId: sub.id, stored: sub.paymentGateway, mandate: mandate.provider },
        'Refusing to charge a mandate through a different provider',
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
      billingDate: new Date(),
      actor: 'scheduler',
    });
    await this.paymentsService.attachCycleMetadata(payment.id, {
      billingCycleId: cycle.id,
      attemptKind: SubscriptionPaymentAttemptKind.AUTOPAY,
      idempotencyKey,
      actor: 'scheduler',
    });
    await this.billingCycleService.updateById(cycle.id, {
      status: SubscriptionBillingCycleStatus.DEBIT_PENDING,
      paymentId: payment.id,
      updatedBy: 'scheduler',
    });
    const result = await this.mandateService.adapter(provider).charge({
      gatewayCustomerId: mandate.gatewayCustomerId ?? '',
      gatewayMandateId: mandate.gatewayMandateId ?? '',
      gatewaySubscriptionId: mandate.gatewaySubscriptionId,
      amount,
      receipt: payment.refId,
      idempotencyKey,
      customer: { email: user?.email, phone: user?.mobileNumber ?? '' },
      notes: buildSubscriptionGatewayNotes({
        paymentPurpose: SUBSCRIPTION_PAYMENT_PURPOSE.PRODUCT_SUBSCRIPTION,
        billingCycleRef,
        subscriptionId: sub.id,
        subscriptionPaymentId: payment.id,
        userId: sub.userId,
        productId: sub.productId,
      }),
    });
    if (result.pending) {
      await this.paymentsService.markReconciling(payment.id, 'scheduler');
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
      rows.find((row) => row.billingCycleRef === buildBillingCycleRef(sub.nextBillingDate as Date)),
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
    return { product, variant, config };
  }

  private async mapOwned(
    entity: UserProductSubscriptionEntity,
    extras?: Parameters<typeof mapUserProductSubscriptionToResponse>[1],
  ) {
    const [mapped] = await this.mapSubscriptionsWithRelations([entity], { extras });
    return mapped;
  }
}
