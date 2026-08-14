import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { generateUniqueRefId } from '@packages/common';
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
  ProductSubscriptionConfigQueryDto,
  VerifyProductSubscriptionPaymentDto,
} from '../dto/product-subscription.dto';
import { ProductSubscriptionStatus } from '../enums/product-subscription-status.enum';
import { UserProductSubscriptionEntity } from '../entities/user-product-subscription.entity';
import { SubscriptionMissedPaymentAction } from '../enums/subscription-missed-payment-action.enum';
import { SubscriptionPaymentStatus } from '../enums/subscription-payment-status.enum';
import { SUBSCRIPTION_PAYMENT_PURPOSE } from '../constants/subscription-payment-purpose.constants';
import { mapUserProductSubscriptionToResponse } from '../mappers/product-subscription.mapper';
import { checkoutExtrasFromLink } from '../utils/checkout-extras.util';
import { UserProductSubscriptionsRepository } from '../repositories/user-product-subscriptions.repository';
import { buildBillingCycleRef } from '../utils/billing-cycle-ref.util';
import { getNextProductBillingDate } from '../utils/next-billing-date.util';
import { buildSubscriptionGatewayNotes } from '../utils/subscription-gateway-notes.util';
import { MembershipBenefitsApplicationService } from './membership-benefits-application.service';
import { ProductSubscriptionConfigService } from './product-subscription-config.service';
import { ProductSubscriptionPaymentsService } from './product-subscription-payments.service';
import { ProductSubscriptionPricingService } from './product-subscription-pricing.service';
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
    return config;
  }

  async create(userId: string, dto: CreateProductSubscriptionDto) {
    const product = await this.productsRepository.findPublishedById(dto.productId);
    if (!product || product.status !== ProductStatus.PUBLISHED) {
      throw new BadRequestException('Product is not available for subscription');
    }
    if (!product.subscriptionEnabled) {
      throw new BadRequestException('Subscription is not enabled for this product');
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
      renewalMethod: configEntity.renewalMethod,
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
    if (!product.subscriptionEnabled) {
      throw new BadRequestException('Subscription is not enabled for this product');
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

    const now = new Date();
    const nextBilling = getNextProductBillingDate(now, dto.frequency);

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
        nextDeliveryDate: nextBilling,
        billingCycleSequence: Math.max(1, pending.billingCycleSequence ?? 0),
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
        nextDeliveryDate: nextBilling,
        renewalMethod: configEntity.renewalMethod,
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

  async listMine(userId: string) {
    const rows = await this.subscriptionsRepository.findByUserId(userId);
    return this.mapSubscriptionsWithRelations(rows);
  }

  async getMine(userId: string, id: string) {
    const sub = await this.subscriptionsRepository.findByIdAndUserId(id, userId);
    if (!sub) throw new NotFoundException('Subscription not found');
    const [mapped] = await this.mapSubscriptionsWithRelations([sub]);
    return mapped;
  }

  async pause(userId: string, id: string, reason?: string) {
    const sub = await this.requireOwnedActiveLike(userId, id);
    if (sub.config && !sub.config.pauseAllowed) {
      throw new BadRequestException('Pause is not allowed for this subscription');
    }
    await this.subscriptionsRepository.updateById(id, {
      status: ProductSubscriptionStatus.PAUSED,
      pausedAt: new Date(),
      cancellationReason: reason ?? sub.cancellationReason,
      updatedBy: userId,
    });
    return this.getMine(userId, id);
  }

  async resume(userId: string, id: string) {
    const sub = await this.subscriptionsRepository.findByIdAndUserId(id, userId);
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.status !== ProductSubscriptionStatus.PAUSED) {
      throw new BadRequestException('Only paused subscriptions can be resumed');
    }
    await this.subscriptionsRepository.updateById(id, {
      status: ProductSubscriptionStatus.ACTIVE,
      pausedAt: null,
      pauseUntil: null,
      updatedBy: userId,
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
      updatedBy: userId,
    });
    this.notificationsService.notifyCancelled({
      userId,
      kind: 'product_subscription',
      refId: sub.refId,
    });
    return this.getMine(userId, id);
  }

  async skipNext(userId: string, id: string) {
    const sub = await this.requireOwnedActiveLike(userId, id);
    if (sub.config && !sub.config.skipAllowed) {
      throw new BadRequestException('Skip is not allowed for this subscription');
    }
    const from = sub.nextBillingDate ?? new Date();
    const next = getNextProductBillingDate(from, sub.frequency);
    await this.subscriptionsRepository.updateById(id, {
      nextBillingDate: next,
      nextDeliveryDate: next,
      updatedBy: userId,
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
    await this.subscriptionsRepository.updateById(id, {
      frequency: dto.frequency,
      updatedBy: userId,
    });
    return this.getMine(userId, id);
  }

  async updateAddress(userId: string, id: string, addressId: string) {
    const sub = await this.subscriptionsRepository.findByIdAndUserId(id, userId);
    if (!sub) throw new NotFoundException('Subscription not found');
    const address = await this.addressesRepository.findByIdAndUserId(addressId, userId);
    if (!address) throw new BadRequestException('Delivery address not found');
    await this.subscriptionsRepository.updateById(id, { addressId, updatedBy: userId });
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

  async getAdmin(id: string) {
    const sub = await this.subscriptionsRepository.findById(id);
    if (!sub) throw new NotFoundException('Subscription not found');
    const [mapped] = await this.mapSubscriptionsWithRelations([sub], { includeUser: true });
    return mapped;
  }

  private async mapSubscriptionsWithRelations(
    rows: Awaited<ReturnType<UserProductSubscriptionsRepository['findByUserId']>>,
    options?: {
      includeUser?: boolean;
      extras?: Parameters<typeof mapUserProductSubscriptionToResponse>[1];
    },
  ) {
    const [users, products, variants] = await Promise.all([
      options?.includeUser
        ? this.relationLoader.loadUsersByIds(rows.map((r) => r.userId))
        : Promise.resolve(new Map()),
      this.relationLoader.loadProductsByIds(rows.map((r) => r.productId)),
      this.relationLoader.loadVariantsByIds(rows.map((r) => r.productVariantId)),
    ]);

    return rows.map((row) =>
      mapUserProductSubscriptionToResponse(row, {
        ...options?.extras,
        user: options?.includeUser ? users.get(row.userId) ?? null : null,
        product: products.get(row.productId) ?? null,
        variant: variants.get(row.productVariantId) ?? null,
      }),
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
    const nextBilling = getNextProductBillingDate(now, sub.frequency);

    await this.subscriptionsRepository.updateById(sub.id, {
      status: ProductSubscriptionStatus.ACTIVE,
      startDate: sub.startDate ?? now,
      nextBillingDate: nextBilling,
      nextDeliveryDate: nextBilling,
      billingCycleSequence: (sub.billingCycleSequence ?? 0) + 1,
      paymentGateway: paidPayment.paymentGateway,
      updatedBy: params.actor ?? 'webhook',
    });

    try {
      await this.ordersService.createOrderFromSubscription({
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
        createdBy: params.actor ?? 'subscription-webhook',
        items: [
          {
            productId: sub.productId,
            variantId: sub.productVariantId,
            quantity: sub.quantity,
            unitPrice: (
              Number(paidPayment.amount) / Math.max(1, sub.quantity)
            ).toFixed(2),
            totalPrice: paidPayment.amount,
          },
        ],
      });
    } catch (error) {
      this.logger.error(
        {
          subscriptionId: sub.id,
          paymentId: paidPayment.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to create order from subscription payment (payment remains PAID)',
      );
    }

    this.notificationsService.notifyActivated({
      userId: sub.userId,
      kind: 'product_subscription',
      refId: sub.refId,
    });
  }

  async processRenewals(asOfDate = new Date()): Promise<number> {
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
      try {
        await this.processSingleRenewal(sub.id, asOfDate);
        processed += 1;
      } catch (error) {
        this.logger.error(
          {
            subscriptionId: sub.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Product subscription renewal failed',
        );
      }
    }
    return processed;
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

    const billingCycleRef = buildBillingCycleRef(sub.nextBillingDate);
    const amount = await this.recalculateAmount(sub);
    const payment = await this.paymentsService.upsertPendingCycle({
      subscriptionId: sub.id,
      userId: sub.userId,
      billingCycleRef,
      amount,
      billingDate: sub.nextBillingDate,
      actor: 'scheduler',
    });

    if (payment.status === SubscriptionPaymentStatus.PAID) return;

    if (
      payment.status === SubscriptionPaymentStatus.LINK_GENERATED &&
      payment.paymentLink
    ) {
      await this.subscriptionsRepository.updateById(sub.id, {
        status: ProductSubscriptionStatus.RENEWAL_PAYMENT_PENDING,
        updatedBy: 'scheduler',
      });
      return;
    }

    const user = await this.usersRepository.findById(sub.userId);
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
      paymentGateway: link.paymentGateway,
      actor: 'scheduler',
    });
    await this.subscriptionsRepository.updateById(sub.id, {
      status: ProductSubscriptionStatus.RENEWAL_PAYMENT_PENDING,
      paymentGateway: link.paymentGateway,
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

  private async mapOwned(
    entity: UserProductSubscriptionEntity,
    extras?: Parameters<typeof mapUserProductSubscriptionToResponse>[1],
  ) {
    const [mapped] = await this.mapSubscriptionsWithRelations([entity], { extras });
    return mapped;
  }
}
