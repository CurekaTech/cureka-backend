import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CashfreePaymentService } from '@modules/payment-requests/services/cashfree-payment.service';
import { PaymentGatewayResolverService } from '@modules/payment-requests/services/payment-gateway-resolver.service';
import { RazorpayPaymentLinksService } from '@modules/payment-requests/services/razorpay-payment-links.service';

export type CreateSubscriptionPaymentLinkInput = {
  amount: string | number;
  currency?: string;
  customer: {
    id: string;
    name?: string;
    email?: string | null;
    phone: string;
  };
  notes: Record<string, string>;
  referenceId: string;
  description?: string;
};

export type CreateSubscriptionPaymentLinkResult = {
  paymentLink: string | null;
  gatewayOrderId: string;
  paymentGateway: string;
  razorpayOrderId?: string | null;
  keyId?: string | null;
  amount?: number | null;
  currency: string;
  paymentSessionId?: string | null;
  environment?: 'sandbox' | 'production';
  customer: {
    name: string;
    email: string;
    contact: string;
  };
};

@Injectable()
export class SubscriptionPaymentLinkService {
  private readonly logger = new Logger(SubscriptionPaymentLinkService.name);

  constructor(
    private readonly gatewayResolver: PaymentGatewayResolverService,
    private readonly razorpayService: RazorpayPaymentLinksService,
    private readonly cashfreeService: CashfreePaymentService,
    private readonly configService: ConfigService,
  ) {}

  async createPaymentLink(
    input: CreateSubscriptionPaymentLinkInput,
  ): Promise<CreateSubscriptionPaymentLinkResult> {
    const amount = Number(input.amount);
    if (!amount || amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }
    if (!input.customer.phone) {
      throw new BadRequestException('Customer phone is required for payment link');
    }

    const gateway = await this.gatewayResolver.getActiveGateway();
    const currency = input.currency ?? 'INR';

    if (gateway === 'cashfree') {
      return this.createCashfreeSession(input, amount, currency);
    }

    if (gateway === 'razorpay') {
      return this.createRazorpayCheckoutOrder(input, amount, currency);
    }

    throw new BadRequestException(`Payment gateway "${gateway}" is not supported for subscriptions`);
  }

  private customerPayload(input: CreateSubscriptionPaymentLinkInput) {
    return {
      name: input.customer.name || input.customer.phone,
      email: input.customer.email ?? '',
      contact: input.customer.phone,
    };
  }

  private async createRazorpayCheckoutOrder(
    input: CreateSubscriptionPaymentLinkInput,
    amount: number,
    currency: string,
  ): Promise<CreateSubscriptionPaymentLinkResult> {
    const amountPaise = Math.round(amount * 100);
    const razorpayOrder = await this.razorpayService.createOrder({
      amount: amountPaise,
      currency,
      receipt: input.referenceId.slice(0, 40),
      notes: input.notes,
    });
    const razorpayOrderId = String(razorpayOrder['id'] ?? '');
    if (!razorpayOrderId) {
      this.logger.error({ razorpayOrder }, 'Razorpay order response missing id');
      throw new BadRequestException('Failed to create Razorpay checkout order');
    }

    return {
      paymentLink: null,
      gatewayOrderId: razorpayOrderId,
      paymentGateway: 'RAZORPAY',
      razorpayOrderId,
      keyId: this.razorpayService.getKeyId(),
      amount: Number(razorpayOrder['amount'] ?? amountPaise),
      currency: String(razorpayOrder['currency'] ?? currency),
      customer: this.customerPayload(input),
    };
  }

  private async createCashfreeSession(
    input: CreateSubscriptionPaymentLinkInput,
    amount: number,
    currency: string,
  ): Promise<CreateSubscriptionPaymentLinkResult> {
    const returnUrl =
      this.configService.get<string>('CASHFREE_RETURN_URL')?.trim() ||
      this.buildStorefrontReturnUrl() ||
      this.configService.get<string>('RAZORPAY_CALLBACK_URL')?.trim() ||
      'https://cureka.com/account/subscriptions';

    const orderTags: Record<string, string> = {};
    for (const key of [
      'paymentPurpose',
      'subscriptionPaymentId',
      'membershipPaymentId',
      'subscriptionId',
      'userMembershipId',
    ]) {
      if (input.notes[key]) orderTags[key] = input.notes[key];
    }

    const order = await this.cashfreeService.createOrder({
      orderId: input.referenceId.slice(0, 45),
      amount,
      currency,
      customer: {
        id: input.customer.id,
        email: input.customer.email ?? undefined,
        phone: input.customer.phone,
        name: input.customer.name,
      },
      returnUrl,
      orderTags,
    });

    const paymentSessionId = String(order['payment_session_id'] ?? '');
    const gatewayOrderId = String(order['order_id'] ?? order['cf_order_id'] ?? input.referenceId);

    if (!paymentSessionId) {
      this.logger.error({ order }, 'Cashfree order response missing payment_session_id');
      throw new BadRequestException('Failed to generate Cashfree payment session');
    }

    const environment = this.cashfreeService.getEnv() === 'production' ? 'production' : 'sandbox';
    const paymentLink =
      environment === 'production'
        ? `https://payments.cashfree.com/order/${paymentSessionId}`
        : `https://sandbox.cashfree.com/pg/view/checkout?payment_session_id=${paymentSessionId}`;

    return {
      paymentLink,
      gatewayOrderId,
      paymentGateway: 'CASHFREE',
      paymentSessionId,
      environment,
      currency,
      customer: this.customerPayload(input),
    };
  }

  private buildStorefrontReturnUrl(): string | undefined {
    const storefrontUrl = this.configService.get<string>('STOREFRONT_URL')?.replace(/\/+$/, '');
    if (!storefrontUrl) {
      return undefined;
    }
    return `${storefrontUrl}/account/subscriptions?order_id={order_id}`;
  }
}
