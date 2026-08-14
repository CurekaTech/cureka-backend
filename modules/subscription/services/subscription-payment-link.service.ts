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
  paymentLink: string;
  gatewayOrderId: string;
  paymentGateway: string;
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
      return this.createRazorpayLink(input, amount, currency);
    }

    throw new BadRequestException(`Payment gateway "${gateway}" is not supported for subscriptions`);
  }

  private async createRazorpayLink(
    input: CreateSubscriptionPaymentLinkInput,
    amount: number,
    currency: string,
  ): Promise<CreateSubscriptionPaymentLinkResult> {
    const amountPaise = Math.round(amount * 100);
    const expireBy = this.razorpayService.getLinkExpiryTimestamp();
    const callbackUrl =
      this.configService.get<string>('RAZORPAY_CALLBACK_URL')?.trim() ||
      this.razorpayService.getCallbackUrl();

    const payload: Record<string, unknown> = {
      amount: amountPaise,
      currency,
      reference_id: input.referenceId.slice(0, 40),
      expire_by: expireBy,
      description: input.description ?? 'Subscription payment',
      customer: {
        name: input.customer.name || input.customer.phone,
        contact: input.customer.phone,
        email: input.customer.email ?? undefined,
      },
      notes: input.notes,
      ...(callbackUrl ? { callback_url: callbackUrl, callback_method: 'get' } : {}),
    };

    const link = await this.razorpayService.createPaymentLink(payload);
    const paymentLink = String(
      (link['short_url'] as string | undefined) ?? (link['url'] as string | undefined) ?? '',
    );
    const gatewayOrderId = String(link['id'] ?? '');

    if (!paymentLink || !gatewayOrderId) {
      this.logger.error({ link }, 'Razorpay payment link response missing url/id');
      throw new BadRequestException('Failed to generate payment link');
    }

    return {
      paymentLink,
      gatewayOrderId,
      paymentGateway: 'RAZORPAY',
    };
  }

  private async createCashfreeSession(
    input: CreateSubscriptionPaymentLinkInput,
    amount: number,
    currency: string,
  ): Promise<CreateSubscriptionPaymentLinkResult> {
    // Same return-URL resolution as PaymentRequestsService checkout (Cashfree requires return_url).
    const returnUrl =
      this.configService.get<string>('CASHFREE_RETURN_URL')?.trim() ||
      this.buildStorefrontReturnUrl() ||
      this.configService.get<string>('RAZORPAY_CALLBACK_URL')?.trim() ||
      'https://cureka.com/thankyou';

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
    });

    const paymentSessionId = String(order['payment_session_id'] ?? '');
    const gatewayOrderId = String(order['order_id'] ?? order['cf_order_id'] ?? input.referenceId);

    if (!paymentSessionId) {
      this.logger.error({ order }, 'Cashfree order response missing payment_session_id');
      throw new BadRequestException('Failed to generate Cashfree payment session');
    }

    // Match existing checkout link format used by PaymentRequestsService.
    const paymentLink = `https://payments.cashfree.com/order/${paymentSessionId}`;

    return {
      paymentLink,
      gatewayOrderId,
      paymentGateway: 'CASHFREE',
    };
  }

  private buildStorefrontReturnUrl(): string | undefined {
    const storefrontUrl = this.configService.get<string>('STOREFRONT_URL')?.replace(/\/+$/, '');
    if (!storefrontUrl) {
      return undefined;
    }
    // Cashfree substitutes {order_id} after payment.
    return `${storefrontUrl}/cart?order_id={order_id}`;
  }
}
