import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionMandateProvider } from '../../enums/subscription-mandate-provider.enum';
import {
  AutopayChargeResult,
  ChargeMandateInput,
  CreateMandateAuthInput,
  ISubscriptionMandateProvider,
  MandateAuthSession,
  MandateStatusSnapshot,
} from '../../interfaces/subscription-mandate-provider.interface';
import { mapRazorpayTokenStatus } from '../../utils/subscription-mandate-status.util';

/**
 * Razorpay Recurring Payments (token / UPI Autopay), not Razorpay Subscriptions plans.
 * Official flow: create customer → create authorization order with token.max_amount
 * → checkout → fetch token → subsequent POST /v1/payments/create/recurring.
 *
 * Variable-amount UPI Autopay uses frequency `as_presented`.
 * Account must have Recurring Payments activated; one-time checkout credentials
 * do not prove that.
 */
@Injectable()
export class RazorpayRecurringProvider implements ISubscriptionMandateProvider {
  readonly provider = SubscriptionMandateProvider.RAZORPAY;
  private readonly logger = new Logger(RazorpayRecurringProvider.name);
  private readonly keyId: string;
  private readonly keySecret: string;

  constructor(private readonly configService: ConfigService) {
    this.keyId = this.configService.get<string>('RAZORPAY_KEY_ID')?.trim() ?? '';
    this.keySecret = this.configService.get<string>('RAZORPAY_SECRET')?.trim() ?? '';
  }

  isConfigured(): boolean {
    return Boolean(this.keyId && this.keySecret);
  }

  async createAuthorizationSession(input: CreateMandateAuthInput): Promise<MandateAuthSession> {
    this.assertConfigured();
    const customer = await this.request('POST', '/customers', {
      name: input.customer.name || input.customer.phone,
      email: input.customer.email || undefined,
      contact: input.customer.phone,
      fail_existing: '0',
      notes: input.notes,
    });
    const customerId = String(customer['id'] ?? '');
    if (!customerId) {
      throw new BadRequestException('Razorpay customer create did not return an id');
    }

    const maxPaise = Math.round(Number(input.maxAmount) * 100);
    const expireAt = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 60 * 60;
    const order = await this.request('POST', '/orders', {
      amount: 100,
      currency: input.currency ?? 'INR',
      customer_id: customerId,
      method: 'upi',
      receipt: `man-${input.subscriptionId}`.slice(0, 40),
      notes: input.notes,
      token: {
        max_amount: maxPaise,
        expire_at: expireAt,
        frequency: 'as_presented',
        type: 'single_block_multiple_debit',
      },
    });
    const orderId = String(order['id'] ?? '');
    if (!orderId) {
      throw new BadRequestException('Razorpay mandate order did not return an id');
    }

    return {
      provider: this.provider,
      authorizationOrderId: orderId,
      gatewayCustomerId: customerId,
      keyId: this.keyId,
      amountPaise: 100,
      currency: input.currency ?? 'INR',
      checkoutPayload: {
        key: this.keyId,
        order_id: orderId,
        customer_id: customerId,
        recurring: '1',
        amount: 100,
        currency: input.currency ?? 'INR',
        name: input.customer.name || 'Cureka Subscribe & Save',
        prefill: {
          name: input.customer.name,
          email: input.customer.email,
          contact: input.customer.phone,
        },
      },
    };
  }

  async fetchMandateStatus(params: {
    gatewayMandateId?: string | null;
    gatewayPaymentId?: string | null;
    gatewayCustomerId?: string | null;
  }): Promise<MandateStatusSnapshot> {
    this.assertConfigured();
    if (params.gatewayPaymentId) {
      const payment = await this.request('GET', `/payments/${params.gatewayPaymentId}`);
      const tokenId =
        typeof payment['token_id'] === 'string'
          ? payment['token_id']
          : typeof payment['token'] === 'string'
            ? payment['token']
            : null;
      const tokenStatus =
        typeof payment['token'] === 'object' && payment['token']
          ? String((payment['token'] as Record<string, unknown>)['recurring_status'] ?? '')
          : '';
      return {
        status: mapRazorpayTokenStatus(tokenStatus || (tokenId ? 'confirmed' : 'pending')),
        gatewayMandateId: tokenId,
        gatewayCustomerId:
          params.gatewayCustomerId ?? (String(payment['customer_id'] ?? '') || null),
        raw: payment,
      };
    }

    if (params.gatewayCustomerId && params.gatewayMandateId) {
      const tokens = await this.request('GET', `/customers/${params.gatewayCustomerId}/tokens`);
      const items = Array.isArray(tokens['items']) ? tokens['items'] : [];
      const token = items.find((item) => String((item as Record<string, unknown>)['id']) === params.gatewayMandateId) as
        | Record<string, unknown>
        | undefined;
      return {
        status: mapRazorpayTokenStatus(String(token?.['recurring_status'] ?? token?.['status'] ?? '')),
        gatewayMandateId: params.gatewayMandateId,
        gatewayCustomerId: params.gatewayCustomerId,
        raw: token ?? tokens,
      };
    }

    return { status: mapRazorpayTokenStatus('pending') };
  }

  async charge(input: ChargeMandateInput): Promise<AutopayChargeResult> {
    this.assertConfigured();
    const amountPaise = Math.round(Number(input.amount) * 100);
    const order = await this.request('POST', '/orders', {
      amount: amountPaise,
      currency: input.currency ?? 'INR',
      payment_capture: true,
      receipt: input.receipt.slice(0, 40),
      notes: input.notes,
    });
    const orderId = String(order['id'] ?? '');
    if (!orderId) {
      return { accepted: false, pending: false, failureReason: 'Razorpay order missing id', raw: order };
    }

    try {
      const payment = await this.request('POST', '/payments/create/recurring', {
        email: input.customer.email || undefined,
        contact: input.customer.phone,
        amount: amountPaise,
        currency: input.currency ?? 'INR',
        order_id: orderId,
        customer_id: input.gatewayCustomerId,
        token: input.gatewayMandateId,
        recurring: true,
        notes: input.notes,
      });
      const status = String(payment['status'] ?? '').toLowerCase();
      if (['created', 'authorized', 'captured'].includes(status)) {
        return {
          accepted: true,
          pending: status !== 'captured',
          gatewayOrderId: orderId,
          gatewayPaymentId: String(payment['id'] ?? '') || null,
          raw: payment,
        };
      }
      return {
        accepted: false,
        pending: ['pending', 'created'].includes(status),
        gatewayOrderId: orderId,
        gatewayPaymentId: String(payment['id'] ?? '') || null,
        failureReason: String(payment['error_description'] ?? payment['status'] ?? 'recurring charge declined'),
        raw: payment,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ orderId, error: message }, 'Razorpay recurring charge did not complete');
      if (/timeout|ECONNRESET|fetch failed|network/i.test(message)) {
        return { accepted: true, pending: true, gatewayOrderId: orderId, failureReason: message };
      }
      return { accepted: false, pending: false, gatewayOrderId: orderId, failureReason: message };
    }
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new BadRequestException('Razorpay Recurring Payments is not configured');
    }
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    const response = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const errorObj = json['error'] as Record<string, unknown> | undefined;
      const description =
        (typeof errorObj?.['description'] === 'string' && errorObj['description']) ||
        (typeof json['message'] === 'string' && json['message']) ||
        `Razorpay ${path} failed (${response.status})`;
      this.logger.warn(
        { path, status: response.status, description },
        'Razorpay Recurring API error — merchant Recurring Payments may not be activated',
      );
      throw new BadRequestException(description);
    }
    return json;
  }
}
