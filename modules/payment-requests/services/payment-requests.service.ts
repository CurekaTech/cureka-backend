import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, In } from 'typeorm';
import { buildPaginatedResult, generateUniqueRefId, getSalableStockQuantity, isVariantInStock } from '@packages/common';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { ProductSubscriptionFrequency } from '@modules/subscription/enums/product-subscription-frequency.enum';
import { UsersRepository } from '@modules/users/repositories/users.repository';
import { UsersService } from '@modules/users/services/users.service';
import { UserAddressesService } from '@modules/users/services/user-addresses.service';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { CartService } from '@modules/orders/services/cart.service';
import { CheckoutService } from '@modules/orders/services/checkout.service';
import { OrdersService } from '@modules/orders/services/orders.service';
import { OrderSource } from '@modules/orders/enums/order-source.enum';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { isPrepaidPaymentMethod } from '@modules/orders/utils/payment-method.util';
import { roundMoney } from '@modules/orders/utils/money.util';
import { CheckoutResolverService } from '@modules/checkout/services/checkout-resolver.service';
import { ShiprocketCheckoutProvider } from '@modules/checkout/providers/shiprocket-checkout.provider';
import {
  CreatePaymentRequestDto,
  GenerateLinkPrefillDto,
  PaymentRequestItemInputDto,
  PaymentRequestQueryDto,
  UpdatePaymentRequestDto,
  ValidateAdminCouponDto,
} from '../dto/payment-request.dto';
import { CouponCheckoutService } from '@modules/orders/services/coupon-checkout.service';
import { CartCheckoutAdminSettingsService } from '@modules/orders/services/cart-checkout-admin-settings.service';
import { PaymentRequestEntity } from '../entities/payment-request.entity';
import { PaymentRequestStatus } from '../enums/payment-request-status.enum';
import {
  mapCodOrderToAdminListItem,
  mapPaymentRequestToAdminListItem,
} from '../mappers/admin-payment-list.mapper';
import { PaymentRequestItemsRepository } from '../repositories/payment-request-items.repository';
import { PaymentRequestsRepository } from '../repositories/payment-requests.repository';
import { CheckoutCancelPaymentDto } from '../dto/checkout-cancel.dto';
import { CheckoutVerifyPaymentDto } from '../dto/checkout-verify.dto';
import { parseIndianMobileNumber } from '@modules/auth/utils/mobile-number.util';
import { RazorpayPaymentLinksService } from './razorpay-payment-links.service';
import { CashfreePaymentService } from './cashfree-payment.service';
import { PaymentGatewayResolverService } from './payment-gateway-resolver.service';
import { canTransitionPaymentRequestStatus } from '../utils/payment-request-status-transition.util';

@Injectable()
export class PaymentRequestsService {
  private readonly logger = new Logger(PaymentRequestsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly usersRepository: UsersRepository,
    private readonly usersService: UsersService,
    private readonly userAddressesService: UserAddressesService,
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
    @Inject(forwardRef(() => CheckoutService))
    private readonly checkoutService: CheckoutService,
    @Inject(forwardRef(() => CartService))
    private readonly cartService: CartService,
    private readonly paymentRequestsRepository: PaymentRequestsRepository,
    private readonly paymentRequestItemsRepository: PaymentRequestItemsRepository,
    private readonly razorpayService: RazorpayPaymentLinksService,
    private readonly cashfreeService: CashfreePaymentService,
    private readonly gatewayResolver: PaymentGatewayResolverService,
    private readonly checkoutResolver: CheckoutResolverService,
    private readonly shiprocketCheckoutProvider: ShiprocketCheckoutProvider,
    private readonly couponCheckoutService: CouponCheckoutService,
    private readonly cartCheckoutAdminSettingsService: CartCheckoutAdminSettingsService,
  ) { }

  async checkoutFromCart(
    userId: string,
    addressId?: string,
    orderSource?: OrderSource,
    customerToken?: string,
    paymentMethod?: OrderPaymentMethod,
  ) {
    const checkoutProvider = await this.checkoutResolver.resolveProvider();
    if (checkoutProvider === 'gokwik') {
      return this.createGokwikCheckoutSession(userId, addressId, customerToken, paymentMethod);
    }
    if (checkoutProvider === 'shiprocket') {
      this.assertAddressRequiredForCheckout(addressId, 'shiprocket');
      return this.createShiprocketCheckoutSession(userId, addressId, orderSource, paymentMethod);
    }

    this.assertAddressRequiredForCheckout(addressId, 'legacy');
    const activeGateway = await this.gatewayResolver.getActiveGateway();
    const prepaidMethod = this.resolveStorefrontPrepaidMethod(activeGateway, paymentMethod);
    if (activeGateway === 'cashfree') {
      const { paymentRequest, customer, totals } = await this.createCheckoutPaymentRequest(
        userId,
        addressId,
        orderSource,
        prepaidMethod,
      );
      const callbackUrl = this.getStorefrontPaymentCallbackUrl();
      const returnUrl = callbackUrl ? `${callbackUrl}?order_id={order_id}` : 'https://cureka.com/thankyou';

      const parsedPhone = parseIndianMobileNumber(customer.mobileNumber!);
      const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Customer';

      this.assertChargeAmountForQr({
        source: 'checkout-link-cashfree',
        paymentMethod: prepaidMethod,
        chargeAmount: Number(totals.totalAmount),
        prepaidDiscount: Number(totals.prepaidDiscount),
        prepaidPercent: Number(totals.prepaidDiscountPercent),
      });

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

      this.logger.log(
        {
          refId: paymentRequest.refId,
          qrChargeAmount: totals.totalAmount,
          prepaidDiscount: totals.prepaidDiscount,
          paymentSessionId,
        },
        '[CHECKOUT] Cashfree QR/session created with prepaid-discounted amount',
      );

      return {
        gateway: 'cashfree',
        paymentData: {
          paymentRequestId: paymentRequest.id,
          refId: paymentRequest.refId,
          paymentSessionId,
          cfOrderId,
          expiresAt: cashfreeOrder['order_expiry_time'] ? new Date(cashfreeOrder['order_expiry_time']) : null,
          amount: Number(totals.totalAmount),
          totalAmount: totals.totalAmount,
          prepaidDiscount: totals.prepaidDiscount,
          paymentLink: `https://payments.cashfree.com/order/${paymentSessionId}`,
        },
      };
    } else if (activeGateway === 'payu') {
      throw new BadRequestException('PayU payment gateway is not fully implemented yet');
    } else {
      const { paymentRequest, totals } = await this.createCheckoutPaymentRequest(
        userId,
        addressId,
        orderSource,
        prepaidMethod,
      );

      this.assertChargeAmountForQr({
        source: 'checkout-link-razorpay',
        paymentMethod: prepaidMethod,
        chargeAmount: Number(totals.totalAmount),
        prepaidDiscount: Number(totals.prepaidDiscount),
        prepaidPercent: Number(totals.prepaidDiscountPercent),
      });

      const withLink = await this.generateLink(paymentRequest.id, userId, undefined, {
        callbackUrl: this.getStorefrontPaymentCallbackUrl(),
      });
      if (!withLink.paymentLink) {
        throw new BadRequestException('Failed to generate payment link');
      }

      this.logger.log(
        {
          refId: withLink.refId,
          qrChargeAmount: totals.totalAmount,
          prepaidDiscount: totals.prepaidDiscount,
          paymentLink: withLink.paymentLink,
        },
        '[CHECKOUT] Razorpay payment-link/QR created with prepaid-discounted amount',
      );

      return {
        gateway: 'razorpay',
        paymentData: {
          paymentRequestId: withLink.id,
          refId: withLink.refId,
          paymentLink: withLink.paymentLink,
          expiresAt: withLink.expiresAt,
          amount: Number(totals.totalAmount),
          totalAmount: totals.totalAmount,
          prepaidDiscount: totals.prepaidDiscount,
        },
      };
    }
  }

  /** Storefront checkout modal — separate from payment-link flow. */
  async checkoutModalFromCart(
    userId: string,
    addressId?: string,
    orderSource?: OrderSource,
    customerToken?: string,
    paymentMethod?: OrderPaymentMethod,
  ) {
    this.logger.log(
      {
        userId,
        addressId,
        orderSource: orderSource ?? null,
        paymentMethod: paymentMethod ?? null,
      },
      '[CHECKOUT-MODAL] start',
    );

    const checkoutProvider = await this.checkoutResolver.resolveProvider();
    this.logger.log(
      { userId, checkoutProvider },
      '[CHECKOUT-MODAL] checkout provider resolved (gokwik/shiprocket/legacy)',
    );

    // GoKwik / Shiprocket only when explicitly enabled; otherwise native PG (Cashfree/Razorpay).
    if (checkoutProvider === 'gokwik') {
      this.logger.log({ userId }, '[CHECKOUT-MODAL] routing to GoKwik');
      return this.createGokwikCheckoutSession(userId, addressId, customerToken, paymentMethod);
    }
    if (checkoutProvider === 'shiprocket') {
      this.assertAddressRequiredForCheckout(addressId, 'shiprocket');
      this.logger.log({ userId }, '[CHECKOUT-MODAL] routing to Shiprocket');
      return this.createShiprocketCheckoutSession(
        userId,
        addressId,
        orderSource,
        paymentMethod,
      );
    }

    // Legacy = intentional native PG path. Do not suggest enabling GoKwik on PG failures.
    this.logger.log(
      {
        userId,
        paymentMethod: paymentMethod ?? null,
        cashfreeCredentials: this.cashfreeService.getCredentialDiagnostics(),
      },
      '[CHECKOUT-MODAL] routing to legacy native PG',
    );
    this.assertAddressRequiredForCheckout(addressId, 'legacy');
    return this.createLegacyModalCheckout(userId, addressId, orderSource, paymentMethod);
  }

  private async createLegacyModalCheckout(
    userId: string,
    addressId: string,
    orderSource?: OrderSource,
    paymentMethod?: OrderPaymentMethod,
  ) {
    this.logger.log(
      {
        userId,
        addressId,
        paymentMethod: paymentMethod ?? null,
        cashfreeCredentials: this.cashfreeService.getCredentialDiagnostics(),
      },
      '[CHECKOUT-MODAL] legacy: resolving active gateway',
    );

    const activeGateway = await this.gatewayResolver.getActiveGateway();
    const prepaidMethod = this.resolveStorefrontPrepaidMethod(activeGateway, paymentMethod);
    this.logger.log(
      { userId, activeGateway, prepaidMethod },
      '[CHECKOUT-MODAL] legacy: active gateway selected',
    );

    if (activeGateway === 'cashfree') {
      this.logger.log(
        {
          userId,
          prepaidMethod,
          credentials: this.cashfreeService.getCredentialDiagnostics(),
        },
        '[CHECKOUT-MODAL] legacy: creating Cashfree session',
      );

      const { paymentRequest, customer, totals } = await this.createCheckoutPaymentRequest(
        userId,
        addressId,
        orderSource,
        prepaidMethod,
      );
      const callbackUrl = this.getStorefrontPaymentCallbackUrl();
      const returnUrl = callbackUrl ? `${callbackUrl}?order_id={order_id}` : 'https://cureka.com/thankyou';

      const parsedPhone = parseIndianMobileNumber(customer.mobileNumber!);
      const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Customer';

      this.logger.log(
        {
          userId,
          paymentRequestId: paymentRequest.id,
          refId: paymentRequest.refId,
          totalAmount: totals.totalAmount,
          prepaidDiscount: totals.prepaidDiscount,
          returnUrl,
          credentials: this.cashfreeService.getCredentialDiagnostics(),
        },
        '[CHECKOUT-MODAL] legacy: Cashfree createOrder params (includes 2% prepaid discount)',
      );

      this.assertChargeAmountForQr({
        source: 'checkout-modal-cashfree',
        paymentMethod: prepaidMethod,
        chargeAmount: Number(totals.totalAmount),
        prepaidDiscount: Number(totals.prepaidDiscount),
        prepaidPercent: Number(totals.prepaidDiscountPercent),
      });

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
        this.logger.error(
          {
            paymentRequestId: paymentRequest.id,
            refId: paymentRequest.refId,
            cashfreeOrderKeys: Object.keys(cashfreeOrder ?? {}),
            credentials: this.cashfreeService.getCredentialDiagnostics(),
          },
          '[CHECKOUT-MODAL] legacy: Cashfree response missing payment_session_id',
        );
        throw new BadRequestException('Failed to create Cashfree order');
      }

      await this.paymentRequestsRepository.updateById(paymentRequest.id, {
        providerReferenceId: cfOrderId,
        paymentReference: cfOrderId,
        paymentProvider: 'CASHFREE',
        status: PaymentRequestStatus.LINK_GENERATED,
        updatedBy: userId,
      });

      this.logger.log(
        {
          paymentRequestId: paymentRequest.id,
          refId: paymentRequest.refId,
          cfOrderId,
          qrChargeAmount: totals.totalAmount,
          prepaidDiscount: totals.prepaidDiscount,
          env: this.cashfreeService.getEnv(),
        },
        '[CHECKOUT-MODAL] legacy: Cashfree QR/session ready with discounted amount',
      );

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
          totalAmount: totals.totalAmount,
          prepaidDiscount: totals.prepaidDiscount,
          customer: {
            name,
            email: customer.email ?? '',
            contact: parsedPhone,
          },
        },
      };
    }

    if (activeGateway === 'payu') {
      this.logger.error({ userId }, '[CHECKOUT-MODAL] legacy: PayU selected but not implemented');
      throw new BadRequestException('PayU payment gateway is not fully implemented yet');
    }

    this.logger.log({ userId, prepaidMethod }, '[CHECKOUT-MODAL] legacy: creating Razorpay modal order');

    const { paymentRequest, customer, totals } = await this.createCheckoutPaymentRequest(
      userId,
      addressId,
      orderSource,
      prepaidMethod,
    );

    this.assertChargeAmountForQr({
      source: 'checkout-modal-razorpay',
      paymentMethod: prepaidMethod,
      chargeAmount: Number(totals.totalAmount),
      prepaidDiscount: Number(totals.prepaidDiscount),
      prepaidPercent: Number(totals.prepaidDiscountPercent),
    });

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
        totalAmount: totals.totalAmount,
        prepaidDiscount: totals.prepaidDiscount,
        customer: {
          name: customerName,
          email: customer.email ?? '',
          contact: parseIndianMobileNumber(customer.mobileNumber!),
        },
      },
    };
  }

  async verifyModalCheckoutPayment(userId: string, dto: CheckoutVerifyPaymentDto) {
    if (dto.shiprocket_session_id || dto.shiprocket_order_id) {
      const sessionId = dto.shiprocket_session_id ?? dto.shiprocket_order_id!;
      const paymentRequest = await this.paymentRequestsRepository.findByProviderReferenceId(sessionId);
      if (!paymentRequest || paymentRequest.customerId !== userId) {
        throw new NotFoundException('Checkout payment request not found');
      }

      const verification = await this.shiprocketCheckoutProvider.verifyPayment(sessionId);
      if (!verification.paid) {
        throw new BadRequestException('Shiprocket Checkout payment verification failed or order is not paid yet');
      }

      await this.handlePaymentLinkPaid(
        sessionId,
        dto.shiprocket_payment_id ?? verification.paymentId,
        'shiprocket-checkout',
      );
      await this.cartService.clear(userId);

      return {
        paymentRequestId: paymentRequest.id,
        refId: paymentRequest.refId,
        totalAmount: paymentRequest.totalAmount,
      };
    }

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

  private async createCheckoutPaymentRequest(
    userId: string,
    addressId: string,
    orderSource: OrderSource = OrderSource.WEBSITE,
    paymentMethod?: OrderPaymentMethod,
  ) {
    // Native online checkout must price as prepaid so QR/PG charge includes 2% off.
    const pricingMethod =
      paymentMethod && isPrepaidPaymentMethod(paymentMethod)
        ? paymentMethod
        : OrderPaymentMethod.RAZORPAY;

    const summary = await this.checkoutService.validateCheckout(userId, {
      addressId,
      paymentMethod: pricingMethod,
    });
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
          isSubscription: item.isSubscription,
          frequency: item.frequency ?? null,
        };
      }),
    );

    const prepaidPercent = summary.checkoutRules?.prepaidDiscountPercent ?? 2;
    let prepaidDiscount = summary.prepaidDiscount;
    let chargeGrandTotal = summary.grandTotal;

    // Safety net: if prepaid pricing did not apply, force line-item % off into the charge.
    if (prepaidPercent > 0 && prepaidDiscount <= 0) {
      prepaidDiscount = roundMoney(
        summary.items.reduce(
          (sum, item) => sum + roundMoney((item.totalPrice * prepaidPercent) / 100),
          0,
        ),
      );
      chargeGrandTotal = roundMoney(
        summary.subtotal -
          summary.discountAmount +
          summary.shippingAmount +
          summary.handlingAmount +
          summary.platformFee +
          summary.codCharge -
          prepaidDiscount,
      );
      this.logger.warn(
        {
          userId,
          pricingMethod,
          prepaidPercent,
          forcedPrepaidDiscount: prepaidDiscount,
          forcedGrandTotal: chargeGrandTotal,
        },
        '[CHECKOUT] Forced prepaid discount onto payment request / QR amount',
      );
    }

    const totals = {
      ...this.computeTotals(
        pricedItems,
        summary.discountAmount > 0 ? summary.discountAmount.toFixed(2) : undefined,
        undefined,
        summary.shippingAmount > 0 ? summary.shippingAmount.toFixed(2) : undefined,
        summary.handlingAmount > 0 ? summary.handlingAmount.toFixed(2) : undefined,
        summary.platformFee > 0 ? summary.platformFee.toFixed(2) : undefined,
        summary.codCharge > 0 ? summary.codCharge.toFixed(2) : undefined,
        Math.max(0, chargeGrandTotal).toFixed(2),
        prepaidDiscount > 0 ? prepaidDiscount.toFixed(2) : undefined,
      ),
      prepaidDiscountPercent: prepaidPercent,
    };

    this.logger.log(
      {
        userId,
        paymentMethod: pricingMethod,
        subtotal: totals.subtotal,
        couponDiscount: totals.discount,
        prepaidDiscount: totals.prepaidDiscount,
        prepaidDiscountPercent: totals.prepaidDiscountPercent,
        shipping: totals.shipping,
        handling: totals.handling,
        platformFee: totals.platformFee,
        totalAmount: totals.totalAmount,
        cartGrandTotal: summary.grandTotal,
        qrWillCharge: totals.totalAmount,
      },
      '[CHECKOUT] payment request totals for QR/PG (must include prepaid discount)',
    );

    const paymentRequest = await this.dataSource.transaction(async (manager) => {
      const refId = await generateUniqueRefId('pay-request', (candidate) =>
        this.paymentRequestsRepository.existsByRefId(candidate),
      );
      const created = await this.paymentRequestsRepository.create(
        {
          refId,
          customerId: userId,
          addressId,
          status: PaymentRequestStatus.PAYMENT_PENDING,
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          shipping: totals.shipping,
          handling: totals.handling,
          platformFee: totals.platformFee,
          codCharge: totals.codCharge,
          prepaidDiscount: totals.prepaidDiscount,
          totalAmount: totals.totalAmount,
          couponCode: summary.coupon?.code ?? null,
          couponDiscount: totals.discount,
          currency: 'INR',
          notes: 'Storefront checkout',
          orderSource:
            orderSource === OrderSource.APP ? OrderSource.APP : OrderSource.WEBSITE,
          paymentProvider: pricingMethod,
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
          isSubscription: item.isSubscription,
          frequency: (item.frequency as ProductSubscriptionFrequency | null) ?? null,
          createdBy: userId,
          updatedBy: userId,
        })),
        manager,
      );

      return (await this.paymentRequestsRepository.findById(created.id, manager)) as PaymentRequestEntity;
    });

    return { paymentRequest, customer, totals };
  }

  private async createGokwikCheckoutSession(
    userId: string,
    addressId?: string,
    customerToken?: string,
    paymentMethod?: OrderPaymentMethod,
  ) {
    const [cart, pricing, customer] = await Promise.all([
      this.cartService.getActiveCartEntity(userId),
      this.checkoutService.validateCheckout(userId, { addressId, paymentMethod }),
      this.usersService.findById(userId),
    ]);
    if (!cart) {
      throw new BadRequestException('Cart not found');
    }

    const appId = this.configService.get<string>('gokwik.appId')?.trim() ?? '';
    const merchantId = this.configService.get<string>('gokwik.merchantId')?.trim() ?? '';
    if (!appId || !merchantId) {
      throw new BadRequestException(
        'GoKwik checkout is enabled but GOKWIK_APP_ID / GOKWIK_MERCHANT_ID are not configured',
      );
    }

    const name =
      [customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
      customer.mobileNumber ||
      'Customer';
    const contact = customer.mobileNumber
      ? parseIndianMobileNumber(customer.mobileNumber)
      : '';

    const kwikpassEnv = (
      this.configService.get<string>('gokwik.kwikpass.environment') ?? 'sandbox'
    )
      .toLowerCase()
      .trim();
    const environment = kwikpassEnv === 'production' ? 'production' : 'sandbox';

    return {
      gateway: 'gokwik',
      checkoutProvider: 'gokwik',
      paymentData: {
        merchantCheckoutId: cart.id,
        appId,
        merchantId,
        amount: pricing.grandTotal,
        currency: 'INR',
        environment,
        ...(customerToken ? { customerToken } : {}),
        customer: {
          name,
          email: customer.email ?? '',
          contact,
        },
      },
    };
  }

  private assertAddressRequiredForCheckout(
    addressId: string | undefined,
    provider: 'shiprocket' | 'legacy',
  ): asserts addressId is string {
    if (addressId?.trim()) {
      return;
    }
    throw new BadRequestException(
      provider === 'shiprocket'
        ? 'addressId is required for Shiprocket checkout'
        : 'addressId is required for checkout',
    );
  }

  private async createShiprocketCheckoutSession(
    userId: string,
    addressId: string,
    orderSource?: OrderSource,
    paymentMethod?: OrderPaymentMethod,
  ) {
    const activeGateway = await this.gatewayResolver.getActiveGateway();
    const prepaidMethod = this.resolveStorefrontPrepaidMethod(activeGateway, paymentMethod);
    const { paymentRequest, customer, totals } = await this.createCheckoutPaymentRequest(
      userId,
      addressId,
      orderSource,
      prepaidMethod,
    );
    this.assertChargeAmountForQr({
      source: 'shiprocket-checkout',
      paymentMethod: prepaidMethod,
      chargeAmount: Number(totals.totalAmount),
      prepaidDiscount: Number(totals.prepaidDiscount),
      prepaidPercent: Number(totals.prepaidDiscountPercent),
    });
    const address = await this.userAddressesService.findOne(userId, addressId);
    const callbackUrl = this.getStorefrontPaymentCallbackUrl();
    const parsedPhone = parseIndianMobileNumber(customer.mobileNumber!);
    const customerName =
      [customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
      customer.mobileNumber ||
      'Customer';

    const session = await this.shiprocketCheckoutProvider.createSession({
      merchantOrderId: paymentRequest.refId,
      paymentRequestId: paymentRequest.id,
      amount: Number(paymentRequest.totalAmount),
      currency: paymentRequest.currency,
      customer: {
        id: customer.id,
        name: customerName,
        email: customer.email ?? undefined,
        phone: parsedPhone,
      },
      shippingAddress: {
        name: address.recipientName,
        phone: address.phoneNumber,
        line1: address.addressLine1,
        line2: address.addressLine2,
        landmark: address.landmark,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
      },
      items: paymentRequest.items.map((item) => ({
        name: item.product?.name ?? 'Product',
        sku: item.variant?.sku ?? item.refId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        total: Number(item.total),
      })),
      successUrl: callbackUrl
        ? `${callbackUrl}?checkout_provider=shiprocket&payment_request_ref_id=${paymentRequest.refId}&status=success`
        : undefined,
      failureUrl: callbackUrl
        ? `${callbackUrl}?checkout_provider=shiprocket&payment_request_ref_id=${paymentRequest.refId}&status=failure`
        : undefined,
      metadata: {
        paymentRequestId: paymentRequest.id,
        paymentRequestRefId: paymentRequest.refId,
        customerId: userId,
        underlyingGateway: 'razorpay',
      },
    });

    await this.paymentRequestsRepository.updateById(paymentRequest.id, {
      providerReferenceId: session.sessionId,
      paymentReference: session.sessionId,
      paymentLink: session.checkoutUrl,
      paymentProvider: 'RAZORPAY',
      status: PaymentRequestStatus.LINK_GENERATED,
      expiresAt: session.expiresAt ?? null,
      updatedBy: userId,
    });

    return {
      gateway: 'shiprocket',
      checkoutProvider: 'shiprocket',
      underlyingGateway: 'razorpay',
      paymentData: {
        paymentRequestId: paymentRequest.id,
        refId: paymentRequest.refId,
        shiprocketSessionId: session.sessionId,
        checkoutUrl: session.checkoutUrl,
        expiresAt: session.expiresAt ?? null,
        totalAmount: paymentRequest.totalAmount,
      },
    };
  }

  async create(dto: CreatePaymentRequestDto, createdBy: string): Promise<PaymentRequestEntity> {
    const customerId = await this.resolveCustomerId(dto);
    const pricedItems = await this.resolveAndValidateItems(dto.items);

    const subtotal = pricedItems.reduce((sum, item) => sum + parseFloat(item.total), 0);
    const couponResult = await this.resolveCoupon(dto.couponCode, customerId, subtotal, dto.items);
    const finalDiscountVal = (Number(dto.discount ?? '0') + couponResult.discount).toFixed(2);

    // Resolve platform fee
    const checkoutAdminSettings = await this.cartCheckoutAdminSettingsService.resolveAmounts();
    const platformFeeVal = this.cartCheckoutAdminSettingsService.getPlatformFee(checkoutAdminSettings);
    const platformFeeThreshold = this.cartCheckoutAdminSettingsService.getPlatformFeeThreshold(checkoutAdminSettings);
    const platformFee = subtotal < platformFeeThreshold ? platformFeeVal : 0;

    const totals = this.computeTotals(
      pricedItems,
      finalDiscountVal,
      dto.tax,
      dto.shipping,
      dto.handling,
      platformFee.toFixed(2),
      '0.00',
      dto.finalAmount,
    );

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
          platformFee: totals.platformFee,
          codCharge: totals.codCharge,
          prepaidDiscount: totals.prepaidDiscount,
          totalAmount: totals.totalAmount,
          currency: 'INR',
          notes: dto.notes ?? null,
          orderSource: OrderSource.ADMIN,
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

    // Resolve platform fee
    const checkoutAdminSettings = await this.cartCheckoutAdminSettingsService.resolveAmounts();
    const platformFeeVal = this.cartCheckoutAdminSettingsService.getPlatformFee(checkoutAdminSettings);
    const platformFeeThreshold = this.cartCheckoutAdminSettingsService.getPlatformFeeThreshold(checkoutAdminSettings);
    const platformFee = subtotal < platformFeeThreshold ? platformFeeVal : 0;

    const totals = this.computeTotals(
      pricedItems,
      finalDiscountVal,
      dto.tax,
      dto.shipping,
      dto.handling,
      platformFee.toFixed(2),
      '0.00',
      dto.finalAmount,
    );

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
          platformFee: totals.platformFee,
          codCharge: totals.codCharge,
          prepaidDiscount: totals.prepaidDiscount,
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
    const { keys, total } = await this.paymentRequestsRepository.findAdminListKeys({
      page,
      limit,
      search: query.search,
      status: query.status,
      customerId: query.customerId,
      fromDate: query.fromDate,
      toDate: query.toDate,
    });

    const normalizeRecordType = (key: {
      id: string;
      recordType?: string;
      recordtype?: string;
    }): 'PAYMENT_REQUEST' | 'COD_ORDER' => {
      const raw = String(key.recordType ?? key.recordtype ?? '').toUpperCase();
      return raw === 'COD_ORDER' ? 'COD_ORDER' : 'PAYMENT_REQUEST';
    };

    const paymentRequestIds = keys
      .filter((key) => normalizeRecordType(key) === 'PAYMENT_REQUEST')
      .map((key) => key.id);
    const codOrderIds = keys
      .filter((key) => normalizeRecordType(key) === 'COD_ORDER')
      .map((key) => key.id);

    const [paymentRequests, codOrders] = await Promise.all([
      this.paymentRequestsRepository.findByIds(paymentRequestIds),
      this.findCodOrdersByIds(codOrderIds),
    ]);

    const paymentRequestById = new Map(paymentRequests.map((row) => [row.id, row]));
    const codOrderById = new Map(codOrders.map((row) => [row.id, row]));

    const data = keys
      .map((key) => {
        if (normalizeRecordType(key) === 'PAYMENT_REQUEST') {
          const request = paymentRequestById.get(key.id);
          return request ? mapPaymentRequestToAdminListItem(request) : null;
        }
        const order = codOrderById.get(key.id);
        return order ? mapCodOrderToAdminListItem(order) : null;
      })
      .filter((row): row is NonNullable<typeof row> => row != null);

    return buildPaginatedResult(data, total, { page, limit, sortOrder: 'DESC' });
  }

  async findOne(id: string) {
    const request = await this.paymentRequestsRepository.findById(id);
    if (request) {
      const addresses = await this.userAddressesService.findAll(request.customerId);
      return {
        ...mapPaymentRequestToAdminListItem(request),
        customer: request.customer
          ? { ...request.customer, addresses }
          : request.customer,
      };
    }

    const codOrder = await this.findCodOrderByIdOrRef(id);
    if (!codOrder) {
      throw new NotFoundException(`Payment request ${id} not found`);
    }

    const addresses = await this.userAddressesService.findAll(codOrder.userId);
    return {
      ...mapCodOrderToAdminListItem(codOrder),
      customer: codOrder.user
        ? { ...codOrder.user, addresses }
        : codOrder.user,
    };
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
    if (existing.paymentProvider === 'COD') {
      throw new BadRequestException('Payment link cannot be generated for COD orders');
    }
    if (![
      PaymentRequestStatus.PAYMENT_PENDING,
      PaymentRequestStatus.LINK_GENERATED,
      PaymentRequestStatus.FAILED,
    ].includes(existing.status)) {
      throw new BadRequestException('Payment link can only be generated for pending requests');
    }
    if (!existing.items.length) {
      throw new BadRequestException('Cannot create payment link without products');
    }
    const amountPaise = Math.round(Number(existing.totalAmount) * 100);
    if (amountPaise <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    this.logger.log(
      {
        paymentRequestId: existing.id,
        refId: existing.refId,
        qrChargeAmount: existing.totalAmount,
        prepaidDiscount: existing.prepaidDiscount ?? '0.00',
        paymentProvider: existing.paymentProvider,
        amountPaise,
      },
      '[CHECKOUT] generateLink/QR amount (must already include prepaid discount for storefront prepaid)',
    );

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
  ): Promise<void> {
    if (existing.status === PaymentRequestStatus.PAID) {
      this.logger.log(
        {
          paymentRequestId: existing.id,
          paymentRequestRefId: existing.refId,
          providerPaymentId,
        },
        'Ignoring duplicate payment-success notification',
      );
      return;
    }

    // Persist the provider-authoritative payment state before attempting downstream
    // order creation. An address, stock, or fulfillment error must never roll a
    // successful payment back to LINK_GENERATED.
    const markedPaid = await this.paymentRequestsRepository.markPaidIfUnpaid(
      existing.id,
      {
        status: PaymentRequestStatus.PAID,
        paymentReference: providerPaymentId ?? existing.paymentReference,
        paidAt: new Date(),
        updatedBy,
      },
    );

    if (!markedPaid) {
      this.logger.log(
        {
          paymentRequestId: existing.id,
          paymentRequestRefId: existing.refId,
          providerPaymentId,
        },
        'Payment request was already marked as paid by another notification',
      );
      return;
    }

    this.logger.log(
      {
        paymentRequestId: existing.id,
        paymentRequestRefId: existing.refId,
        providerPaymentId,
        previousStatus: existing.status,
        updatedBy,
      },
      'Payment request persisted as PAID',
    );

    try {
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

      if (existing.couponCode) {
        const coupon = await this.couponCheckoutService.findByCode(existing.couponCode);
        if (coupon) {
          couponDetails = {
            couponId: coupon.id,
            couponCode: coupon.code,
            couponTitle: coupon.title,
            couponDiscountType: coupon.discountType,
          };
        }
      }

      const paymentMethod = this.mapPaymentProviderToOrderMethod(existing.paymentProvider);

      const createdOrder = await this.ordersService.createOrderFromPaymentRequest({
        customerId: existing.customerId,
        addressId: existing.addressId,
        paymentRequestId: existing.id,
        paymentRequestRefId: existing.refId,
        subtotal: existing.subtotal,
        discountAmount: existing.discount,
        shippingAmount: existing.shipping ?? '0.00',
        handlingAmount: existing.handling ?? '0.00',
        prepaidDiscount: existing.prepaidDiscount ?? '0.00',
        grandTotal: existing.totalAmount,
        notes: existing.notes ?? null,
        paymentMethod,
        orderSource: existing.orderSource ?? OrderSource.ADMIN,
        createdBy: updatedBy,
        ...couponDetails,
        platformFee: existing.platformFee,
        codCharge: existing.codCharge,
        items: existing.items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.total,
          isSubscription: item.isSubscription,
          frequency: (item.frequency as ProductSubscriptionFrequency | null) ?? null,
        })),
      });
      this.logger.log(
        {
          paymentRequestId: existing.id,
          paymentRequestRefId: existing.refId,
          orderId: createdOrder.id,
          orderNumber: createdOrder.orderNumber,
        },
        'Order created for paid payment request',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        {
          paymentRequestId: existing.id,
          paymentRequestRefId: existing.refId,
          providerPaymentId,
          addressId: existing.addressId,
          error: message,
        },
        'Payment remains PAID, but order creation failed and requires follow-up',
      );
    }
  }

  private getStorefrontPaymentCallbackUrl(): string | undefined {
    const storefrontUrl = this.configService.get<string>('STOREFRONT_URL')?.replace(/\/+$/, '');
    if (!storefrontUrl) {
      this.logger.warn('STOREFRONT_URL is not set; Razorpay payment link will not redirect back to the storefront.');
      return undefined;
    }
    return `${storefrontUrl}/thankyou`;
  }

  async handleCashfreePaymentSuccess(
    orderId: string,
    providerPaymentId?: string,
    updatedBy = 'cashfree-webhook',
  ): Promise<void> {
    this.logger.log(
      { orderId, providerPaymentId, updatedBy },
      'Handling Cashfree payment success',
    );
    const existing = await this.paymentRequestsRepository.findById(orderId);
    if (!existing) {
      this.logger.warn(`Payment request not found for Cashfree orderId ${orderId}`);
      return;
    }
    await this.markRequestAsPaid(existing, providerPaymentId, updatedBy);
  }

  async handleShiprocketCheckoutPaymentSuccess(
    sessionId: string,
    providerPaymentId?: string,
    updatedBy = 'shiprocket-checkout-webhook',
  ): Promise<void> {
    const verification = await this.shiprocketCheckoutProvider.verifyPayment(sessionId);
    if (!verification.paid) {
      this.logger.warn(`Shiprocket Checkout session ${sessionId} is not paid. status=${verification.status ?? 'N/A'}`);
      return;
    }

    await this.handlePaymentLinkPaid(sessionId, providerPaymentId ?? verification.paymentId, updatedBy);
  }

  async handlePaymentLinkPaid(
    providerReferenceId: string,
    providerPaymentId?: string,
    updatedBy = 'razorpay-webhook',
  ): Promise<void> {
    this.logger.log(
      { providerReferenceId, providerPaymentId, updatedBy },
      'Handling Razorpay payment link paid',
    );
    const existing = await this.paymentRequestsRepository.findByProviderReferenceId(providerReferenceId);
    if (!existing) {
      this.logger.warn(`Payment request not found for provider reference ${providerReferenceId}`);
      return;
    }
    await this.markRequestAsPaid(existing, providerPaymentId, updatedBy);
  }

  async handlePaymentCaptured(paymentRequestId: string, providerPaymentId?: string): Promise<void> {
    this.logger.log(
      { paymentRequestId, providerPaymentId },
      'Handling Razorpay payment captured',
    );
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
    await this.markRequestAsFailed(existing, reason, 'razorpay-webhook');
  }

  async handlePaymentFailedByProviderReference(
    providerReferenceId: string,
    reason?: string,
    updatedBy = 'payment-webhook',
  ): Promise<void> {
    const existing =
      await this.paymentRequestsRepository.findByProviderReferenceId(providerReferenceId);
    if (!existing) {
      this.logger.warn(
        `Payment request not found for provider reference ${providerReferenceId}`,
      );
      return;
    }
    await this.markRequestAsFailed(existing, reason, updatedBy);
  }

  private async markRequestAsFailed(
    existing: PaymentRequestEntity,
    reason?: string,
    updatedBy = 'payment-webhook',
  ): Promise<void> {
    if (!canTransitionPaymentRequestStatus(existing.status, PaymentRequestStatus.FAILED)) {
      this.logger.log(
        {
          paymentRequestId: existing.id,
          status: existing.status,
          reason: reason || 'N/A',
        },
        'Ignoring payment-failed notification — request already paid or terminal',
      );
      return;
    }

    const notesSuffix = reason?.trim()
      ? `Payment failed: ${reason.trim()}`
      : 'Payment failed';
    const notes = existing.notes?.trim()
      ? `${existing.notes.trim()}\n${notesSuffix}`
      : notesSuffix;

    await this.paymentRequestsRepository.updateById(existing.id, {
      status: PaymentRequestStatus.FAILED,
      notes,
      updatedBy,
    });

    this.logger.warn(
      {
        paymentRequestId: existing.id,
        refId: existing.refId,
        reason: reason || 'N/A',
      },
      'Payment request marked as FAILED',
    );

    // Ensure failed prepaid checkouts appear on GET /admin/orders.
    try {
      const paymentMethod = this.mapPaymentProviderToOrderMethod(existing.paymentProvider);
      await this.ordersService.createFailedOrderFromPaymentRequest({
        customerId: existing.customerId,
        addressId: existing.addressId,
        paymentRequestId: existing.id,
        paymentRequestRefId: existing.refId,
        subtotal: existing.subtotal,
        discountAmount: existing.discount,
        shippingAmount: existing.shipping ?? '0.00',
        handlingAmount: existing.handling ?? '0.00',
        prepaidDiscount: existing.prepaidDiscount ?? '0.00',
        grandTotal: existing.totalAmount,
        notes: existing.notes ?? null,
        failureReason: reason ?? null,
        paymentMethod,
        orderSource: existing.orderSource ?? OrderSource.WEBSITE,
        createdBy: updatedBy,
        platformFee: existing.platformFee,
        codCharge: existing.codCharge,
        items: (existing.items ?? []).map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.total,
          isSubscription: item.isSubscription,
          frequency: (item.frequency as ProductSubscriptionFrequency | null) ?? null,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        {
          paymentRequestId: existing.id,
          refId: existing.refId,
          error: message,
        },
        'Failed order materialization after payment failure (non-blocking)',
      );
    }
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
    if (!existing) return;
    if (!canTransitionPaymentRequestStatus(existing.status, PaymentRequestStatus.CANCELLED)) {
      this.logger.log(
        {
          paymentRequestId: existing.id,
          status: existing.status,
        },
        'Ignoring cancel webhook — payment request already paid or terminal',
      );
      return;
    }
    await this.paymentRequestsRepository.updateById(existing.id, {
      status: PaymentRequestStatus.CANCELLED,
      updatedBy: 'razorpay-webhook',
    });
  }

  async handlePaymentLinkExpired(providerReferenceId: string): Promise<void> {
    const existing = await this.paymentRequestsRepository.findByProviderReferenceId(providerReferenceId);
    if (!existing) return;
    if (!canTransitionPaymentRequestStatus(existing.status, PaymentRequestStatus.EXPIRED)) {
      this.logger.log(
        {
          paymentRequestId: existing.id,
          status: existing.status,
        },
        'Ignoring expire webhook — payment request already paid or terminal',
      );
      return;
    }
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

  private async findCodOrdersByIds(ids: string[]): Promise<OrderEntity[]> {
    if (!ids.length) {
      return [];
    }
    return this.dataSource.getRepository(OrderEntity).find({
      where: { id: In(ids), paymentMethod: OrderPaymentMethod.COD },
      relations: {
        user: true,
        items: {
          product: true,
          variant: true,
        },
      },
      order: { items: { createdAt: 'ASC' } },
    });
  }

  private async findCodOrderByIdOrRef(idOrRefId: string): Promise<OrderEntity | null> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrRefId);
    const repo = this.dataSource.getRepository(OrderEntity);
    return repo.findOne({
      where: isUuid
        ? { id: idOrRefId, paymentMethod: OrderPaymentMethod.COD }
        : [
            { refId: idOrRefId, paymentMethod: OrderPaymentMethod.COD },
            { orderNumber: idOrRefId, paymentMethod: OrderPaymentMethod.COD },
          ],
      relations: {
        user: true,
        items: {
          product: true,
          variant: true,
        },
      },
      order: { items: { createdAt: 'ASC' } },
    });
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
        stock: getSalableStockQuantity(v.stock),
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

  private mapPaymentProviderToOrderMethod(provider?: string | null): OrderPaymentMethod {
    const normalized = String(provider ?? '')
      .trim()
      .toUpperCase();
    if (normalized === 'CASHFREE') return OrderPaymentMethod.CASHFREE;
    if (normalized === 'COD') return OrderPaymentMethod.COD;
    if (normalized === 'WALLET') return OrderPaymentMethod.WALLET;
    if (normalized === 'GOKWIK_PREPAID') return OrderPaymentMethod.GOKWIK_PREPAID;
    return OrderPaymentMethod.RAZORPAY;
  }

  private resolveStorefrontPrepaidMethod(
    activeGateway: 'cashfree' | 'razorpay' | 'payu',
    requested?: OrderPaymentMethod,
  ): OrderPaymentMethod {
    if (requested && isPrepaidPaymentMethod(requested)) {
      return requested;
    }
    if (activeGateway === 'cashfree') {
      return OrderPaymentMethod.CASHFREE;
    }
    return OrderPaymentMethod.RAZORPAY;
  }

  /**
   * Refuse to open a PG/QR session at full price when prepaid % is configured.
   */
  private assertChargeAmountForQr(params: {
    source: string;
    paymentMethod: OrderPaymentMethod;
    chargeAmount: number;
    prepaidDiscount: number;
    prepaidPercent: number;
  }): void {
    this.logger.log(
      {
        source: params.source,
        paymentMethod: params.paymentMethod,
        qrChargeAmount: params.chargeAmount,
        prepaidDiscount: params.prepaidDiscount,
        prepaidPercent: params.prepaidPercent,
      },
      '[CHECKOUT] QR/PG charge amount check',
    );

    if (!isPrepaidPaymentMethod(params.paymentMethod)) {
      return;
    }
    if (params.prepaidPercent > 0 && params.prepaidDiscount <= 0) {
      throw new BadRequestException(
        `Prepaid ${params.prepaidPercent}% discount was not applied to the payment QR amount. ` +
          'Retry checkout; do not charge the full cart total.',
      );
    }
    if (params.chargeAmount <= 0) {
      throw new BadRequestException('Payment QR amount must be greater than zero');
    }
  }

  private computeTotals(
    items: Array<{ total: string }>,
    discount?: string,
    tax?: string,
    shipping?: string,
    handling?: string,
    platformFee?: string,
    codCharge?: string,
    finalAmount?: string,
    prepaidDiscount?: string,
  ) {
    const subtotalNum = items.reduce((sum, item) => sum + Number(item.total), 0);
    const discountNum = Number(discount ?? '0');
    const taxNum = Number(tax ?? '0');
    const shippingNum = Number(shipping ?? '0');
    const handlingNum = Number(handling ?? '0');
    const platformFeeNum = Number(platformFee ?? '0');
    const codChargeNum = Number(codCharge ?? '0');
    const prepaidDiscountNum = Number(prepaidDiscount ?? '0');
    const computed =
      subtotalNum -
      discountNum +
      taxNum +
      shippingNum +
      handlingNum +
      platformFeeNum +
      codChargeNum -
      prepaidDiscountNum;
    const totalAmountNum = finalAmount ? Number(finalAmount) : computed;

    if (totalAmountNum <= 0) throw new BadRequestException('Amount must be greater than zero');
    return {
      subtotal: subtotalNum.toFixed(2),
      discount: discountNum.toFixed(2),
      tax: taxNum.toFixed(2),
      shipping: shippingNum.toFixed(2),
      handling: handlingNum.toFixed(2),
      platformFee: platformFeeNum.toFixed(2),
      codCharge: codChargeNum.toFixed(2),
      prepaidDiscount: prepaidDiscountNum.toFixed(2),
      totalAmount: totalAmountNum.toFixed(2),
    };
  }

  async validateAdminCoupon(dto: ValidateAdminCouponDto) {
    const pricedItems = await this.resolveAndValidateItems(dto.items);
    const subtotal = pricedItems.reduce((sum, item) => sum + parseFloat(item.total), 0);
    const result = await this.resolveCoupon(dto.couponCode, dto.customerId, subtotal, dto.items);
    
    // Resolve platform fee
    const checkoutAdminSettings = await this.cartCheckoutAdminSettingsService.resolveAmounts();
    const platformFeeVal = this.cartCheckoutAdminSettingsService.getPlatformFee(checkoutAdminSettings);
    const platformFeeThreshold = this.cartCheckoutAdminSettingsService.getPlatformFeeThreshold(checkoutAdminSettings);
    const platformFee = subtotal < platformFeeThreshold ? platformFeeVal : 0;

    const finalAmount = Math.max(0, subtotal - result.discount + platformFee);

    return {
      couponCode: result.code,
      discountAmount: result.discount.toFixed(2),
      subtotal: subtotal.toFixed(2),
      platformFee: platformFee.toFixed(2),
      finalAmount: finalAmount.toFixed(2),
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
          mrp: null,
          totalPrice: unitPriceNum * item.quantity,
          stock: getSalableStockQuantity(variant?.stock ?? 0, item.quantity),
          inStock: isVariantInStock(variant?.stock ?? 0),
          isAvailable: true,
          primaryImageUrl: null,
          productDetails: [],
          categoryId: variant?.product?.categoryId ?? '',
          subCategoryId: variant?.product?.subCategoryId ?? null,
          subSubCategoryId: variant?.product?.subSubCategoryId ?? null,
          subSubSubCategoryId: variant?.product?.subSubSubCategoryId ?? null,
          brandId: variant?.product?.brandId ?? null,
          isSubscription: false,
          frequency: null,
          lineType: 'ONE_TIME' as const,
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

