import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { buildPaginatedResult, generateUniqueRefId } from '@packages/common';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { UsersRepository } from '@modules/users/repositories/users.repository';
import { UsersService } from '@modules/users/services/users.service';
import { CartService } from '@modules/orders/services/cart.service';
import { CheckoutService } from '@modules/orders/services/checkout.service';
import { OrdersService } from '@modules/orders/services/orders.service';
import {
  CreatePaymentRequestDto,
  GenerateLinkPrefillDto,
  PaymentRequestItemInputDto,
  PaymentRequestQueryDto,
  UpdatePaymentRequestDto,
  ValidateAdminCouponDto,
} from '../dto/payment-request.dto';
import { CouponCheckoutService } from '@modules/orders/services/coupon-checkout.service';
import { PaymentRequestEntity } from '../entities/payment-request.entity';
import { PaymentRequestStatus } from '../enums/payment-request-status.enum';
import { PaymentRequestItemsRepository } from '../repositories/payment-request-items.repository';
import { PaymentRequestsRepository } from '../repositories/payment-requests.repository';
import { CheckoutCancelPaymentDto } from '../dto/checkout-cancel.dto';
import { CheckoutVerifyPaymentDto } from '../dto/checkout-verify.dto';
import { parseIndianMobileNumber } from '@modules/auth/utils/mobile-number.util';
import { RazorpayPaymentLinksService } from './razorpay-payment-links.service';
import { CashfreePaymentService } from './cashfree-payment.service';
import { PaymentGatewayResolverService } from './payment-gateway-resolver.service';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';

@Injectable()
export class PaymentRequestsService {
  private readonly logger = new Logger(PaymentRequestsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly usersRepository: UsersRepository,
    private readonly usersService: UsersService,
    private readonly ordersService: OrdersService,
    private readonly checkoutService: CheckoutService,
    private readonly cartService: CartService,
    private readonly paymentRequestsRepository: PaymentRequestsRepository,
    private readonly paymentRequestItemsRepository: PaymentRequestItemsRepository,
    private readonly razorpayService: RazorpayPaymentLinksService,
    private readonly cashfreeService: CashfreePaymentService,
    private readonly gatewayResolver: PaymentGatewayResolverService,
    private readonly couponCheckoutService: CouponCheckoutService,
  ) { }

  async checkoutFromCart(userId: string, addressId: string) {
    const activeGateway = await this.gatewayResolver.getActiveGateway();
    if (activeGateway === 'cashfree') {
      const { paymentRequest, customer, totals } = await this.createCheckoutPaymentRequest(userId, addressId);
      const callbackUrl = this.getStorefrontPaymentCallbackUrl();
      const returnUrl = callbackUrl ? `${callbackUrl}?order_id={order_id}` : 'https://cureka.com/thankyou';

      const parsedPhone = parseIndianMobileNumber(customer.mobileNumber!);
      const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Customer';

      const cashfreeOrder = await this.cashfreeService.createOrder({
        orderId: paymentRequest.refId,
        amount: Number(totals.totalAmount),
        currency: paymentRequest.currency,
        customer: {
          id: customer.id,
          email: customer.email ?? undefined,
          phone: parsedPhone,
          name,
        },
        returnUrl,
      });

      const paymentSessionId = String(cashfreeOrder['payment_session_id'] ?? '');
      const cfOrderId = String(cashfreeOrder['cf_order_id'] ?? '');
      if (!paymentSessionId) {
        throw new BadRequestException('Failed to create Cashfree order');
      }

      await this.paymentRequestsRepository.updateById(paymentRequest.id, {
        providerReferenceId: cfOrderId,
        paymentReference: cfOrderId,
        paymentLink: `https://payments.cashfree.com/order/${paymentSessionId}`,
        paymentProvider: 'CASHFREE',
        status: PaymentRequestStatus.LINK_GENERATED,
        updatedBy: userId,
      });

      return {
        gateway: 'cashfree',
        paymentData: {
          paymentRequestId: paymentRequest.id,
          refId: paymentRequest.refId,
          paymentSessionId,
          cfOrderId,
          expiresAt: cashfreeOrder['order_expiry_time'] ? new Date(cashfreeOrder['order_expiry_time']) : null,
          totalAmount: paymentRequest.totalAmount,
          paymentLink: `https://payments.cashfree.com/order/${paymentSessionId}`,
        },
      };
    } else if (activeGateway === 'payu') {
      throw new BadRequestException('PayU payment gateway is not fully implemented yet');
    } else {
      const { paymentRequest } = await this.createCheckoutPaymentRequest(userId, addressId);

      const withLink = await this.generateLink(paymentRequest.id, userId, undefined, {
        callbackUrl: this.getStorefrontPaymentCallbackUrl(),
      });
      if (!withLink.paymentLink) {
        throw new BadRequestException('Failed to generate payment link');
      }

      return {
        gateway: 'razorpay',
        paymentData: {
          paymentRequestId: withLink.id,
          refId: withLink.refId,
          paymentLink: withLink.paymentLink,
          expiresAt: withLink.expiresAt,
          totalAmount: withLink.totalAmount,
        },
      };
    }
  }

  /** Storefront checkout modal — separate from payment-link flow. */
  async checkoutModalFromCart(userId: string, addressId: string) {
    const activeGateway = await this.gatewayResolver.getActiveGateway();
    if (activeGateway === 'cashfree') {
      const { paymentRequest, customer, totals } = await this.createCheckoutPaymentRequest(userId, addressId);
      const callbackUrl = this.getStorefrontPaymentCallbackUrl();
      const returnUrl = callbackUrl ? `${callbackUrl}?order_id={order_id}` : 'https://cureka.com/thankyou';

      const parsedPhone = parseIndianMobileNumber(customer.mobileNumber!);
      const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Customer';

      const cashfreeOrder = await this.cashfreeService.createOrder({
        orderId: paymentRequest.refId,
        amount: Number(totals.totalAmount),
        currency: paymentRequest.currency,
        customer: {
          id: customer.id,
          email: customer.email ?? undefined,
          phone: parsedPhone,
          name,
        },
        returnUrl,
      });

      const paymentSessionId = String(cashfreeOrder['payment_session_id'] ?? '');
      const cfOrderId = String(cashfreeOrder['cf_order_id'] ?? '');
      if (!paymentSessionId) {
        throw new BadRequestException('Failed to create Cashfree order');
      }

      await this.paymentRequestsRepository.updateById(paymentRequest.id, {
        providerReferenceId: cfOrderId,
        paymentReference: cfOrderId,
        paymentProvider: 'CASHFREE',
        status: PaymentRequestStatus.LINK_GENERATED,
        updatedBy: userId,
      });

      return {
        gateway: 'cashfree',
        paymentData: {
          paymentRequestId: paymentRequest.id,
          refId: paymentRequest.refId,
          cfOrderId,
          paymentSessionId,
          amount: Number(totals.totalAmount),
          currency: paymentRequest.currency,
          appId: this.cashfreeService.getAppId(),
          environment: this.cashfreeService.getEnv(),
          totalAmount: paymentRequest.totalAmount,
          customer: {
            name,
            email: customer.email ?? '',
            contact: parsedPhone,
          },
        },
      };
    } else if (activeGateway === 'payu') {
      throw new BadRequestException('PayU payment gateway is not fully implemented yet');
    } else {
      const { paymentRequest, customer, totals } = await this.createCheckoutPaymentRequest(
        userId,
        addressId,
      );

      const amountPaise = Math.round(Number(totals.totalAmount) * 100);
      const razorpayOrder = await this.razorpayService.createOrder({
        amount: amountPaise,
        currency: paymentRequest.currency,
        receipt: paymentRequest.refId,
        notes: {
          paymentRequestId: paymentRequest.id,
          paymentRequestRefId: paymentRequest.refId,
          customerId: userId,
        },
      });

      const razorpayOrderId = String(razorpayOrder['id'] ?? '');
      if (!razorpayOrderId) {
        throw new BadRequestException('Failed to create Razorpay order');
      }

      await this.paymentRequestsRepository.updateById(paymentRequest.id, {
        providerReferenceId: razorpayOrderId,
        paymentReference: razorpayOrderId,
        status: PaymentRequestStatus.LINK_GENERATED,
        updatedBy: userId,
      });

      const customerName =
        [customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
        customer.mobileNumber ||
        'Customer';

      return {
        gateway: 'razorpay',
        paymentData: {
          paymentRequestId: paymentRequest.id,
          refId: paymentRequest.refId,
          razorpayOrderId,
          amount: Number(razorpayOrder['amount'] ?? amountPaise),
          currency: String(razorpayOrder['currency'] ?? paymentRequest.currency),
          keyId: this.razorpayService.getKeyId(),
          totalAmount: paymentRequest.totalAmount,
          customer: {
            name: customerName,
            email: customer.email ?? '',
            contact: parseIndianMobileNumber(customer.mobileNumber!),
          },
        },
      };
    }
  }

  async verifyModalCheckoutPayment(userId: string, dto: CheckoutVerifyPaymentDto) {
    if (dto.cf_order_id) {
      const paymentRequest = await this.resolveCashfreeCheckoutPaymentRequest(
        userId,
        dto.cf_order_id,
      );

      // Cashfree GET /orders/{order_id} expects the merchant order_id (our refId), not cf_order_id.
      const cashfreeOrder = await this.cashfreeService.getOrder(paymentRequest.refId);
      if (cashfreeOrder['order_status'] !== 'PAID') {
        throw new BadRequestException('Payment verification failed or order is not paid yet');
      }

      const providerPaymentId =
        dto.cf_payment_id ||
        String(cashfreeOrder['cf_payment_id'] ?? cashfreeOrder['cf_order_id'] ?? '');

      await this.handleCashfreePaymentSuccess(
        paymentRequest.refId,
        providerPaymentId || undefined,
        userId,
      );
      await this.cartService.clear(userId);

      return {
        paymentRequestId: paymentRequest.id,
        refId: paymentRequest.refId,
        totalAmount: paymentRequest.totalAmount,
      };
    } else {
      this.razorpayService.verifyPaymentSignature(
        dto.razorpay_order_id!,
        dto.razorpay_payment_id!,
        dto.razorpay_signature!,
      );

      const paymentRequest = await this.paymentRequestsRepository.findByProviderReferenceId(
        dto.razorpay_order_id!,
      );
      if (!paymentRequest || paymentRequest.customerId !== userId) {
        throw new NotFoundException('Checkout payment request not found');
      }

      await this.handlePaymentLinkPaid(dto.razorpay_order_id!, dto.razorpay_payment_id!, userId);
      await this.cartService.clear(userId);

      return {
        paymentRequestId: paymentRequest.id,
        refId: paymentRequest.refId,
        totalAmount: paymentRequest.totalAmount,
      };
    }
  }

  async cancelModalCheckoutPayment(userId: string, dto: CheckoutCancelPaymentDto) {
    const paymentRequest = await this.getRequestOrThrow(dto.paymentRequestId);
    if (paymentRequest.customerId !== userId) {
      throw new NotFoundException('Checkout payment request not found');
    }
    if (paymentRequest.status === PaymentRequestStatus.PAID) {
      throw new BadRequestException('Paid checkout cannot be cancelled');
    }

    await this.paymentRequestsRepository.updateById(paymentRequest.id, {
      status: PaymentRequestStatus.CANCELLED,
      updatedBy: userId,
    });

    return { paymentRequestId: paymentRequest.id, status: PaymentRequestStatus.CANCELLED };
  }

  private async resolveCashfreeCheckoutPaymentRequest(
    userId: string,
    cfOrderIdOrRefId: string,
  ) {
    let paymentRequest = await this.paymentRequestsRepository.findByProviderReferenceId(
      cfOrderIdOrRefId,
    );

    if (!paymentRequest) {
      paymentRequest = await this.paymentRequestsRepository.findById(cfOrderIdOrRefId);
    }

    if (!paymentRequest || paymentRequest.customerId !== userId) {
      throw new NotFoundException('Checkout payment request not found');
    }

    return paymentRequest;
  }

  private async createCheckoutPaymentRequest(userId: string, addressId: string) {
    const summary = await this.checkoutService.validateCheckout(userId, { addressId });
    if (!summary.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    const customer = await this.usersRepository.findById(userId);
    if (!customer?.mobileNumber) {
      throw new BadRequestException('Phone number is required for online payment');
    }

    const pricedItems = await Promise.all(
      summary.items.map(async (item) => {
        const refId = await generateUniqueRefId('pay-item', (candidate) =>
          this.paymentRequestItemsRepository.existsByRefId(candidate),
        );
        const unitPrice = item.unitPrice.toFixed(2);
        const total = item.totalPrice.toFixed(2);
        return {
          refId,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice,
          discount: '0.00',
          tax: '0.00',
          total,
        };
      }),
    );

    const totals = this.computeTotals(
      pricedItems,
      summary.discountAmount > 0 ? summary.discountAmount.toFixed(2) : undefined,
      undefined,
      summary.shippingAmount > 0 ? summary.shippingAmount.toFixed(2) : undefined,
      summary.handlingAmount > 0 ? summary.handlingAmount.toFixed(2) : undefined,
    );

    const paymentRequest = await this.dataSource.transaction(async (manager) => {
      const refId = await generateUniqueRefId('pay-request', (candidate) =>
        this.paymentRequestsRepository.existsByRefId(candidate),
      );
      const created = await this.paymentRequestsRepository.create(
        {
          refId,
          customerId: userId,
          status: PaymentRequestStatus.PAYMENT_PENDING,
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          shipping: totals.shipping,
          handling: totals.handling,
          totalAmount: totals.totalAmount,
          currency: 'INR',
          notes: 'Storefront checkout',
          createdBy: userId,
          updatedBy: userId,
        },
        manager,
      );

      await this.paymentRequestItemsRepository.createMany(
        pricedItems.map((item) => ({
          refId: item.refId,
          paymentRequestId: created.id,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          tax: item.tax,
          total: item.total,
          createdBy: userId,
          updatedBy: userId,
        })),
        manager,
      );

      return (await this.paymentRequestsRepository.findById(created.id, manager)) as PaymentRequestEntity;
    });

    return { paymentRequest, customer, totals };
  }

  async create(dto: CreatePaymentRequestDto, createdBy: string): Promise<PaymentRequestEntity> {
    const customerId = await this.resolveCustomerId(dto);
    const pricedItems = await this.resolveAndValidateItems(dto.items);

    const subtotal = pricedItems.reduce((sum, item) => sum + parseFloat(item.total), 0);
    const couponResult = await this.resolveCoupon(dto.couponCode, customerId, subtotal, dto.items);
    const finalDiscountVal = (Number(dto.discount ?? '0') + couponResult.discount).toFixed(2);

    const totals = this.computeTotals(pricedItems, finalDiscountVal, dto.tax, dto.shipping, dto.handling, dto.finalAmount);

    return this.dataSource.transaction(async (manager) => {
      const refId = await generateUniqueRefId('pay-request', (candidate) =>
        this.paymentRequestsRepository.existsByRefId(candidate),
      );
      const created = await this.paymentRequestsRepository.create(
        {
          refId,
          customerId,
          status: PaymentRequestStatus.PAYMENT_PENDING,
          subtotal: totals.subtotal,
          discount: totals.discount,
          couponCode: couponResult.code,
          couponDiscount: couponResult.discount.toFixed(2),
          tax: totals.tax,
          shipping: totals.shipping,
          handling: totals.handling,
          totalAmount: totals.totalAmount,
          currency: 'INR',
          notes: dto.notes ?? null,
          createdBy,
          updatedBy: createdBy,
        },
        manager,
      );

      await this.paymentRequestItemsRepository.createMany(
        pricedItems.map((item) => ({
          refId: item.refId,
          paymentRequestId: created.id,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          tax: item.tax,
          total: item.total,
          createdBy,
          updatedBy: createdBy,
        })),
        manager,
      );

      return (await this.paymentRequestsRepository.findById(created.id, manager)) as PaymentRequestEntity;
    });
  }

  async update(id: string, dto: UpdatePaymentRequestDto, updatedBy: string): Promise<PaymentRequestEntity> {
    const existing = await this.getRequestOrThrow(id);
    if (![PaymentRequestStatus.PAYMENT_PENDING, PaymentRequestStatus.LINK_GENERATED].includes(existing.status)) {
      throw new BadRequestException('Payment request can only be edited while pending payment');
    }

    if (existing.status === PaymentRequestStatus.LINK_GENERATED && existing.providerReferenceId) {
      await this.razorpayService.cancelPaymentLink(existing.providerReferenceId);
    }

    const pricedItems = await this.resolveAndValidateItems(dto.items);
    const subtotal = pricedItems.reduce((sum, item) => sum + parseFloat(item.total), 0);

    const couponResult = await this.resolveCoupon(dto.couponCode, existing.customerId, subtotal, dto.items);
    const finalDiscountVal = (Number(dto.discount ?? '0') + couponResult.discount).toFixed(2);

    const totals = this.computeTotals(pricedItems, finalDiscountVal, dto.tax, dto.shipping, dto.handling, dto.finalAmount);

    return this.dataSource.transaction(async (manager) => {
      await this.paymentRequestsRepository.updateById(
        existing.id,
        {
          subtotal: totals.subtotal,
          discount: totals.discount,
          couponCode: couponResult.code,
          couponDiscount: couponResult.discount.toFixed(2),
          tax: totals.tax,
          shipping: totals.shipping,
          handling: totals.handling,
          totalAmount: totals.totalAmount,
          notes: dto.notes ?? existing.notes,
          paymentLink: null,
          providerReferenceId: null,
          paymentReference: null,
          expiresAt: null,
          status: PaymentRequestStatus.PAYMENT_PENDING,
          updatedBy,
        },
        manager,
      );
      await this.paymentRequestItemsRepository.deleteByPaymentRequestId(existing.id, manager);
      await this.paymentRequestItemsRepository.createMany(
        pricedItems.map((item) => ({
          refId: item.refId,
          paymentRequestId: existing.id,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          tax: item.tax,
          total: item.total,
          createdBy: updatedBy,
          updatedBy,
        })),
        manager,
      );

      return (await this.paymentRequestsRepository.findById(existing.id, manager)) as PaymentRequestEntity;
    });
  }

  async findAll(query: PaymentRequestQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { data, total } = await this.paymentRequestsRepository.findPaginated({
      page,
      limit,
      search: query.search,
      status: query.status,
      customerId: query.customerId,
      fromDate: query.fromDate,
      toDate: query.toDate,
    });
    return buildPaginatedResult(data, total, { page, limit, sortOrder: 'DESC' });
  }

  async findOne(id: string): Promise<PaymentRequestEntity> {
    return this.getRequestOrThrow(id);
  }

  async cancel(id: string, updatedBy: string): Promise<PaymentRequestEntity> {
    const existing = await this.getRequestOrThrow(id);
    if (existing.status === PaymentRequestStatus.PAID) {
      throw new BadRequestException('Paid payment request cannot be cancelled');
    }
    if (existing.providerReferenceId?.startsWith('plink_')) {
      await this.razorpayService.cancelPaymentLink(existing.providerReferenceId);
    }
    await this.paymentRequestsRepository.updateById(existing.id, {
      status: PaymentRequestStatus.CANCELLED,
      updatedBy,
    });
    return this.getRequestOrThrow(existing.id);
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.getRequestOrThrow(id);
    if (existing.status === PaymentRequestStatus.PAID) {
      throw new BadRequestException('Paid payment request cannot be deleted');
    }
    await this.paymentRequestsRepository.updateById(existing.id, { deletedAt: new Date() });
  }

  async generateLink(
    id: string,
    updatedBy: string,
    prefill?: GenerateLinkPrefillDto,
    options?: { callbackUrl?: string },
  ): Promise<PaymentRequestEntity> {
    const existing = await this.getRequestOrThrow(id);
    if (![PaymentRequestStatus.PAYMENT_PENDING, PaymentRequestStatus.LINK_GENERATED].includes(existing.status)) {
      throw new BadRequestException('Payment link can only be generated for pending requests');
    }
    if (!existing.items.length) {
      throw new BadRequestException('Cannot create payment link without products');
    }
    const amountPaise = Math.round(Number(existing.totalAmount) * 100);
    if (amountPaise <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    const customer = await this.usersRepository.findById(existing.customerId);

    // Validate prefill if provided
    if (prefill && Object.keys(prefill).length > 0 && !prefill.phone) {
      throw new BadRequestException('phone is mandatory when custom prefill details are provided');
    }

    const finalPhone = prefill?.phone || customer?.mobileNumber;
    const finalEmail = prefill?.email || customer?.email;

    if (!finalPhone) {
      throw new BadRequestException('Customer phone is required for payment link');
    }

    const reference = existing.refId;
    const expireBy = this.razorpayService.getLinkExpiryTimestamp();

    const payload: Record<string, any> = {
      amount: amountPaise,
      currency: existing.currency,
      reference_id: reference,
      expire_by: expireBy,
      customer: {
        name: [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') || finalPhone,
        contact: finalPhone,
        email: finalEmail ?? undefined,
      },
      notes: {
        paymentRequestId: existing.id,
        paymentRequestRefId: existing.refId,
        customerId: existing.customerId,
      },
      ...(options?.callbackUrl
        ? { callback_url: options.callbackUrl, callback_method: 'get' }
        : {}),
    };

    // Format description and display product details
    const description = this.formatRazorpayDescription(existing);
    if (description) {
      payload.description = description;
    }

    // Add callback redirection URLs if configured
    const callbackUrl = this.razorpayService.getCallbackUrl();
    if (callbackUrl) {
      payload.callback_url = callbackUrl;
      payload.callback_method = 'get';
    }

    const link = await this.razorpayService.createPaymentLink(payload);

    await this.paymentRequestsRepository.updateById(existing.id, {
      paymentLink: String((link['short_url'] as string | undefined) ?? (link['url'] as string | undefined) ?? ''),
      providerReferenceId: String(link['id'] as string),
      paymentReference: String((link['reference_id'] as string | undefined) ?? reference),
      paymentProvider: 'RAZORPAY',
      expiresAt: link['expire_by'] ? new Date(Number(link['expire_by']) * 1000) : null,
      status: PaymentRequestStatus.LINK_GENERATED,
      updatedBy,
    });
    this.logger.log(`Payment link created for payment request ${existing.refId}`);
    return this.getRequestOrThrow(existing.id);
  }

  async regenerateLink(
    id: string,
    updatedBy: string,
    prefill?: GenerateLinkPrefillDto,
  ): Promise<PaymentRequestEntity> {
    const existing = await this.getRequestOrThrow(id);
    if (existing.status === PaymentRequestStatus.PAID) {
      throw new BadRequestException('Cannot regenerate link for paid request');
    }
    if (existing.providerReferenceId?.startsWith('plink_')) {
      await this.razorpayService.cancelPaymentLink(existing.providerReferenceId);
    }
    await this.paymentRequestsRepository.updateById(existing.id, {
      status: PaymentRequestStatus.PAYMENT_PENDING,
      paymentLink: null,
      providerReferenceId: null,
      paymentReference: null,
      expiresAt: null,
      updatedBy,
    });
    return this.generateLink(id, updatedBy, prefill);
  }

  private async markRequestAsPaid(
    existing: PaymentRequestEntity,
    providerPaymentId?: string,
    updatedBy = 'razorpay-webhook',
    manager?: EntityManager,
  ): Promise<void> {
    if (existing.status === PaymentRequestStatus.PAID) {
      return;
    }

    const runInTransaction = async (txManager: EntityManager) => {
      const fresh = await this.paymentRequestsRepository.findById(existing.id, txManager);
      if (!fresh || fresh.status === PaymentRequestStatus.PAID) {
        return;
      }

      await this.paymentRequestsRepository.updateById(
        fresh.id,
        {
          status: PaymentRequestStatus.PAID,
          paymentReference: providerPaymentId ?? fresh.paymentReference,
          paidAt: new Date(),
          updatedBy,
        },
        txManager,
      );

      const shippingVal = Number(fresh.shipping ?? '0') + Number(fresh.handling ?? '0');
      
      let couponDetails: {
        couponId: string | null;
        couponCode: string | null;
        couponTitle: string | null;
        couponDiscountType: string | null;
      } = {
        couponId: null,
        couponCode: null,
        couponTitle: null,
        couponDiscountType: null,
      };

      if (fresh.couponCode) {
        const coupon = await this.couponCheckoutService.findByCode(fresh.couponCode);
        if (coupon) {
          couponDetails = {
            couponId: coupon.id,
            couponCode: coupon.code,
            couponTitle: coupon.title,
            couponDiscountType: coupon.discountType,
          };
        }
      }

      await this.ordersService.createOrderFromPaymentRequest({
        customerId: fresh.customerId,
        paymentRequestId: fresh.id,
        paymentRequestRefId: fresh.refId,
        subtotal: fresh.subtotal,
        discountAmount: fresh.discount,
        shippingAmount: shippingVal.toFixed(2),
        grandTotal: fresh.totalAmount,
        notes: fresh.notes ?? null,
        paymentMethod: fresh.paymentProvider as OrderPaymentMethod,
        createdBy: updatedBy,
        ...couponDetails,
        items: fresh.items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.total,
        })),
      });
    };

    if (manager) {
      await runInTransaction(manager);
    } else {
      await this.dataSource.transaction(async (txManager) => {
        await runInTransaction(txManager);
      });
    }

    this.logger.log(`Order created and payment request ${existing.refId} marked as PAID`);
  }

  private getStorefrontPaymentCallbackUrl(): string | undefined {
    const storefrontUrl = this.configService.get<string>('STOREFRONT_URL')?.replace(/\/+$/, '');
    if (!storefrontUrl) {
      this.logger.warn('STOREFRONT_URL is not set; Razorpay payment link will not redirect back to the storefront.');
      return undefined;
    }
    return `${storefrontUrl}/cart`;
  }

  async handleCashfreePaymentSuccess(
    orderId: string,
    providerPaymentId?: string,
    updatedBy = 'cashfree-webhook',
  ): Promise<void> {
    const existing = await this.paymentRequestsRepository.findById(orderId);
    if (!existing) {
      this.logger.warn(`Payment request not found for Cashfree orderId ${orderId}`);
      return;
    }
    await this.markRequestAsPaid(existing, providerPaymentId, updatedBy);
  }

  async handlePaymentLinkPaid(
    providerReferenceId: string,
    providerPaymentId?: string,
    updatedBy = 'razorpay-webhook',
  ): Promise<void> {
    const existing = await this.paymentRequestsRepository.findByProviderReferenceId(providerReferenceId);
    if (!existing) {
      this.logger.warn(`Payment request not found for provider reference ${providerReferenceId}`);
      return;
    }
    await this.markRequestAsPaid(existing, providerPaymentId, updatedBy);
  }

  async handlePaymentCaptured(paymentRequestId: string, providerPaymentId?: string): Promise<void> {
    const existing = await this.paymentRequestsRepository.findById(paymentRequestId);
    if (!existing) {
      this.logger.warn(`Payment request not found for ID ${paymentRequestId}`);
      return;
    }
    await this.markRequestAsPaid(existing, providerPaymentId);
  }

  async handlePaymentFailed(paymentRequestId: string, reason?: string): Promise<void> {
    const existing = await this.paymentRequestsRepository.findById(paymentRequestId);
    if (!existing) {
      this.logger.warn(`Payment request not found for ID ${paymentRequestId}`);
      return;
    }
    this.logger.warn(`Payment failed for payment request ${existing.refId}. Reason: ${reason || 'N/A'}`);
  }

  async handlePaymentPending(paymentRequestId: string): Promise<void> {
    const existing = await this.paymentRequestsRepository.findById(paymentRequestId);
    if (!existing) {
      this.logger.warn(`Payment request not found for ID ${paymentRequestId}`);
      return;
    }
    this.logger.log(`Payment attempt pending for payment request ${existing.refId}`);
  }

  async handlePaymentLinkCancelled(providerReferenceId: string): Promise<void> {
    const existing = await this.paymentRequestsRepository.findByProviderReferenceId(providerReferenceId);
    if (!existing || existing.status === PaymentRequestStatus.PAID) return;
    await this.paymentRequestsRepository.updateById(existing.id, {
      status: PaymentRequestStatus.CANCELLED,
      updatedBy: 'razorpay-webhook',
    });
  }

  async handlePaymentLinkExpired(providerReferenceId: string): Promise<void> {
    const existing = await this.paymentRequestsRepository.findByProviderReferenceId(providerReferenceId);
    if (!existing || existing.status === PaymentRequestStatus.PAID) return;
    await this.paymentRequestsRepository.updateById(existing.id, {
      status: PaymentRequestStatus.EXPIRED,
      updatedBy: 'razorpay-webhook',
    });
  }

  formatRazorpayDescription(request: PaymentRequestEntity): string {
    const items = request.items;
    let suffix = '';
    if (request.couponCode && Number(request.couponDiscount) > 0) {
      suffix = ` | Coupon: ${request.couponCode} applied (-₹${Number(request.couponDiscount).toFixed(2)})`;
    }

    if (!items || items.length === 0) {
      return `Payment Request: ${request.refId}${suffix}`;
    }

    let baseDesc = '';
    if (items.length === 1) {
      const item = items[0];
      const prodName = item.product?.name || 'Product';
      const prodDesc = item.product?.description || '';
      const cleanDesc = prodDesc ? ` - ${prodDesc.replace(/<[^>]*>/g, '').slice(0, 150)}` : '';
      const cleanPrice = Number(item.unitPrice).toFixed(2);
      baseDesc = `${prodName}${cleanDesc} (Qty: ${item.quantity}) · Price: ₹${cleanPrice}`;
    } else {
      const itemsList = items
        .map((item, idx) => `${idx + 1}. ${item.product?.name || 'Product'} (Qty: ${item.quantity})`)
        .join(', ');
      baseDesc = `Items: ${itemsList}`;
    }

    const fullDesc = `${baseDesc}${suffix}`;
    if (fullDesc.length > 1000) {
      return fullDesc.slice(0, 997) + '...';
    }
    return fullDesc;
  }

  private async getRequestOrThrow(id: string): Promise<PaymentRequestEntity> {
    const request = await this.paymentRequestsRepository.findById(id);
    if (!request) throw new NotFoundException(`Payment request ${id} not found`);
    return request;
  }

  /**
   * Lightweight product + variant search for the payment-request creation wizard.
   * Returns products grouped with their active variants (id, sku, price, stock, attribute label).
   */
  async searchProducts(search: string, limit = 20) {
    type ProductVariantResult = {
      variantId: string;
      sku: string;
      mrp: string;
      sellingPrice: string;
      stock: number;
      attributeLabel: string | null;
    };
    type ProductResult = {
      productId: string;
      productName: string;
      variants: ProductVariantResult[];
    };

    const variants = await this.dataSource
      .getRepository(ProductVariantEntity)
      .createQueryBuilder('variant')
      .innerJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('variant.attributeValues', 'attributeValues')
      .where('variant.status = :vStatus', { vStatus: VariantStatus.ACTIVE })
      .andWhere('product.status = :pStatus', { pStatus: ProductStatus.PUBLISHED })
      .andWhere(
        '(product.name ILIKE :search OR variant.sku ILIKE :search)',
        { search: `%${search}%` },
      )
      .orderBy('product.name', 'ASC')
      .addOrderBy('variant.sku', 'ASC')
      .limit(limit)
      .getMany();

    // Group variants by product
    const productMap = new Map<string, ProductResult>();
    const result: ProductResult[] = [];

    for (const v of variants) {
      if (!productMap.has(v.productId)) {
        const entry: ProductResult = { productId: v.productId, productName: v.product.name, variants: [] };
        productMap.set(v.productId, entry);
        result.push(entry);
      }
      const attrLabel = v.attributeValues?.length
        ? v.attributeValues.map((av) => av.value).join(' / ')
        : null;
      productMap.get(v.productId)!.variants.push({
        variantId: v.id,
        sku: v.sku,
        mrp: v.mrp,
        sellingPrice: v.sellingPrice,
        stock: v.stock,
        attributeLabel: attrLabel,
      });
    }

    return result;
  }
  private async resolveCustomerId(dto: CreatePaymentRequestDto): Promise<string> {
    if (dto.customerId) {
      const customer = await this.usersRepository.findById(dto.customerId);
      if (!customer) throw new BadRequestException('Customer not found');
      return customer.id;
    }
    if (!dto.customerPhone) {
      throw new BadRequestException('customerPhone is required when customerId is not provided');
    }
    const existing = await this.usersRepository.findByMobileNumber(dto.customerPhone);
    if (existing) return existing.id;
    const created = await this.usersService.createFromMobileNumber(dto.customerPhone);
    return created.id;
  }

  private async resolveAndValidateItems(items: PaymentRequestItemInputDto[]) {
    if (!items.length) throw new BadRequestException('At least one product is required');

    return Promise.all(
      items.map(async (item, index) => {
        const variant = await this.dataSource.getRepository(ProductVariantEntity).findOne({
          where: { id: item.variantId, productId: item.productId },
        });
        if (!variant) {
          throw new BadRequestException(`Invalid product/variant at row ${index + 1}`);
        }
        const unitPrice = Number(item.unitPrice);
        if (unitPrice <= 0) {
          throw new BadRequestException(`Unit price must be greater than zero at row ${index + 1}`);
        }
        const quantity = item.quantity;
        const discount = Number(item.discount ?? '0');
        const tax = Number(item.tax ?? '0');
        const total = unitPrice * quantity - discount + tax;
        if (total <= 0) {
          throw new BadRequestException(`Item total must be greater than zero at row ${index + 1}`);
        }

        const refId = await generateUniqueRefId('pay-item', (candidate) =>
          this.paymentRequestItemsRepository.existsByRefId(candidate),
        );
        return {
          ...item,
          refId,
          unitPrice: unitPrice.toFixed(2),
          discount: discount.toFixed(2),
          tax: tax.toFixed(2),
          total: total.toFixed(2),
        };
      }),
    );
  }

  private computeTotals(
    items: Array<{ total: string }>,
    discount?: string,
    tax?: string,
    shipping?: string,
    handling?: string,
    finalAmount?: string,
  ) {
    const subtotalNum = items.reduce((sum, item) => sum + Number(item.total), 0);
    const discountNum = Number(discount ?? '0');
    const taxNum = Number(tax ?? '0');
    const shippingNum = Number(shipping ?? '0');
    const handlingNum = Number(handling ?? '0');
    const computed = subtotalNum - discountNum + taxNum + shippingNum + handlingNum;
    const totalAmountNum = finalAmount ? Number(finalAmount) : computed;

    if (totalAmountNum <= 0) throw new BadRequestException('Amount must be greater than zero');
    return {
      subtotal: subtotalNum.toFixed(2),
      discount: discountNum.toFixed(2),
      tax: taxNum.toFixed(2),
      shipping: shippingNum.toFixed(2),
      handling: handlingNum.toFixed(2),
      totalAmount: totalAmountNum.toFixed(2),
    };
  }

  async validateAdminCoupon(dto: ValidateAdminCouponDto) {
    const pricedItems = await this.resolveAndValidateItems(dto.items);
    const subtotal = pricedItems.reduce((sum, item) => sum + parseFloat(item.total), 0);
    const result = await this.resolveCoupon(dto.couponCode, dto.customerId, subtotal, dto.items);
    return {
      couponCode: result.code,
      discountAmount: result.discount.toFixed(2),
      subtotal: subtotal.toFixed(2),
      finalAmount: Math.max(0, subtotal - result.discount).toFixed(2),
    };
  }

  private async resolveCoupon(
    couponCode?: string,
    customerId?: string,
    subtotal = 0,
    items: PaymentRequestItemInputDto[] = [],
  ) {
    if (!couponCode || !couponCode.trim()) {
      return { code: null, discount: 0 };
    }

    const coupon = await this.couponCheckoutService.findByCode(couponCode);
    if (!coupon) {
      throw new BadRequestException(`Coupon code '${couponCode}' not found`);
    }

    const eligibleItems = await Promise.all(
      items.map(async (item) => {
        const variant = await this.dataSource.getRepository(ProductVariantEntity).findOne({
          where: { id: item.variantId },
          relations: ['product'],
        });
        const unitPriceNum = Number(item.unitPrice);
        return {
          id: '',
          productId: item.productId,
          variantId: item.variantId,
          productName: '',
          sku: '',
          variantLabel: null,
          quantity: item.quantity,
          unitPrice: unitPriceNum,
          totalPrice: unitPriceNum * item.quantity,
          stock: variant?.stock ?? 0,
          isAvailable: true,
          primaryImageUrl: null,
          categoryId: variant?.product?.categoryId ?? '',
          subCategoryId: variant?.product?.subCategoryId ?? null,
          subSubCategoryId: variant?.product?.subSubCategoryId ?? null,
          subSubSubCategoryId: variant?.product?.subSubSubCategoryId ?? null,
          brandId: variant?.product?.brandId ?? null,
        };
      }),
    );

    await this.couponCheckoutService.validateCoupon(coupon, {
      userId: customerId || 'admin-checkout',
      subtotal,
      items: eligibleItems,
    });

    const eligibleSubtotal = this.couponCheckoutService.getDiscountSubtotal(coupon, {
      userId: customerId || 'admin-checkout',
      subtotal,
      items: eligibleItems,
    });

    const discountAmount = this.couponCheckoutService.calculateDiscount(coupon, eligibleSubtotal);

    return {
      code: coupon.code,
      discount: discountAmount,
    };
  }
}

