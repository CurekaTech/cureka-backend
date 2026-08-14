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
    const returnUrl =
      this.configService.get<string>('CASHFREE_RETURN_URL')?.trim() ||
      this.configService.get<string>('RAZORPAY_CALLBACK_URL')?.trim() ||
      '';

    if (!returnUrl) {
      throw new BadRequestException('Cashfree return URL is not configured');
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
    });

    const paymentLink = String(
      order['payment_session_id']
        ? (order['payment_link'] ??
            order['payments']?.['url'] ??
            order['order_meta']?.['payment_link'] ??
            '')
        : (order['payment_link'] ?? ''),
    );

    // Cashfree checkout often returns payment_session_id; store order_id as gateway ref
    const gatewayOrderId = String(order['order_id'] ?? input.referenceId);
    const sessionId = order['payment_session_id'] ? String(order['payment_session_id']) : '';
    const resolvedLink =
      paymentLink ||
      (sessionId
        ? `${this.configService.get<string>('CASHFREE_CHECKOUT_BASE_URL') ?? 'https://payments.cashfree.com/forms'}/${sessionId}`
        : '');

    if (!resolvedLink) {
      this.logger.error({ order }, 'Cashfree order response missing payment link/session');
      throw new BadRequestException('Failed to generate Cashfree payment session');
    }

    return {
      paymentLink: resolvedLink,
      gatewayOrderId,
      paymentGateway: 'CASHFREE',
    };
  }
}
