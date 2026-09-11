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
import { mapCashfreeSubscriptionStatus } from '../../utils/subscription-mandate-status.util';

/**
 * Cashfree Subscriptions API (official):
 * POST /pg/subscriptions  (ON_DEMAND plan for variable amounts)
 * POST /pg/subscriptions/pay with payment_type CHARGE
 *
 * UPI Autopay cut-off: schedule T+1 (or later). Controlled notification + 24h
 * wait is a separate merchant-controlled flow; the default Raise a Charge call
 * lets Cashfree send the pre-debit notification.
 */
@Injectable()
export class CashfreeSubscriptionProvider implements ISubscriptionMandateProvider {
  readonly provider = SubscriptionMandateProvider.CASHFREE;
  private readonly logger = new Logger(CashfreeSubscriptionProvider.name);
  private readonly appId: string;
  private readonly secretKey: string;
  private readonly apiVersion: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.appId = this.configService.get<string>('CASHFREE_APP_ID')?.trim() ?? '';
    this.secretKey = this.configService.get<string>('CASHFREE_SECRET_KEY')?.trim() ?? '';
    this.apiVersion = this.configService.get<string>('CASHFREE_API_VERSION') ?? '2023-08-01';
    const env = (this.configService.get<string>('CASHFREE_ENV') ?? 'sandbox').toLowerCase();
    this.baseUrl = env === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
  }

  isConfigured(): boolean {
    return Boolean(this.appId && this.secretKey);
  }

  async createAuthorizationSession(input: CreateMandateAuthInput): Promise<MandateAuthSession> {
    this.assertConfigured();
    const subscriptionId = `sub_${input.subscriptionId}`.slice(0, 250);
    const body = {
      subscription_id: subscriptionId,
      customer_details: {
        customer_name: input.customer.name || input.customer.phone,
        customer_email: input.customer.email || undefined,
        customer_phone: input.customer.phone,
      },
      plan_details: {
        plan_name: 'SubscribeSave',
        plan_type: 'ON_DEMAND',
        plan_currency: input.currency ?? 'INR',
        plan_max_amount: Number(input.maxAmount),
      },
      authorization_details: {
        authorization_amount: 1,
        authorization_amount_refund: true,
        payment_methods: ['upi', 'enach', 'card'],
      },
      subscription_meta: {
        return_url: input.returnUrl,
      },
      subscription_tags: input.notes,
    };
    const created = await this.request('POST', '/subscriptions', body);
    const sessionId = String(created['subscription_session_id'] ?? '');
    const cfId = String(created['cf_subscription_id'] ?? '');
    if (!sessionId && !String(created['subscription_id'] ?? '')) {
      throw new BadRequestException('Cashfree subscription create did not return a session');
    }
    return {
      provider: this.provider,
      authorizationOrderId: String(created['subscription_id'] ?? subscriptionId),
      gatewaySubscriptionId: cfId || String(created['subscription_id'] ?? subscriptionId),
      currency: input.currency ?? 'INR',
      paymentSessionId: sessionId || null,
      authorizationLink: sessionId
        ? `${this.baseUrl.replace('/pg', '')}/pg/view/subscriptions?subscription_session_id=${sessionId}`
        : null,
      checkoutPayload: {
        subscription_session_id: sessionId,
        subscription_id: created['subscription_id'],
        cf_subscription_id: cfId,
      },
    };
  }

  async fetchMandateStatus(params: {
    gatewaySubscriptionId?: string | null;
  }): Promise<MandateStatusSnapshot> {
    this.assertConfigured();
    if (!params.gatewaySubscriptionId) {
      return { status: mapCashfreeSubscriptionStatus('INITIALIZED') };
    }
    const details = await this.request(
      'GET',
      `/subscriptions/${encodeURIComponent(params.gatewaySubscriptionId)}`,
    );
    return {
      status: mapCashfreeSubscriptionStatus(String(details['subscription_status'] ?? '')),
      gatewaySubscriptionId: String(details['subscription_id'] ?? params.gatewaySubscriptionId),
      gatewayMandateId: String(details['cf_subscription_id'] ?? details['subscription_id'] ?? '') || null,
      raw: details,
    };
  }

  async charge(input: ChargeMandateInput): Promise<AutopayChargeResult> {
    this.assertConfigured();
    const subscriptionId = input.gatewaySubscriptionId || input.gatewayMandateId;
    const scheduleDate = input.scheduleDate ?? this.defaultUpiScheduleDate();
    try {
      const payment = await this.request('POST', '/subscriptions/pay', {
        subscription_id: subscriptionId,
        payment_id: input.idempotencyKey.slice(0, 50),
        payment_amount: Number(input.amount),
        payment_type: 'CHARGE',
        payment_schedule_date: scheduleDate.toISOString(),
      });
      const status = String(payment['payment_status'] ?? payment['status'] ?? '').toUpperCase();
      if (['SUCCESS', 'PAID'].includes(status)) {
        return {
          accepted: true,
          pending: false,
          gatewayOrderId: String(payment['payment_id'] ?? input.idempotencyKey),
          gatewayPaymentId: String(payment['cf_payment_id'] ?? '') || null,
          raw: payment,
        };
      }
      if (['INITIALIZED', 'PENDING', 'ACTIVE'].includes(status)) {
        return {
          accepted: true,
          pending: true,
          gatewayOrderId: String(payment['payment_id'] ?? input.idempotencyKey),
          gatewayPaymentId: String(payment['cf_payment_id'] ?? '') || null,
          raw: payment,
        };
      }
      return {
        accepted: false,
        pending: false,
        gatewayOrderId: String(payment['payment_id'] ?? input.idempotencyKey),
        failureReason: String(payment['failure_reason'] ?? status ?? 'Cashfree charge declined'),
        raw: payment,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/timeout|ECONNRESET|fetch failed|network/i.test(message)) {
        return { accepted: true, pending: true, failureReason: message };
      }
      return { accepted: false, pending: false, failureReason: message };
    }
  }

  private defaultUpiScheduleDate(): Date {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 1);
    return date;
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new BadRequestException('Cashfree Subscriptions is not configured');
    }
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'x-client-id': this.appId,
        'x-client-secret': this.secretKey,
        'x-api-version': this.apiVersion,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const message =
        (typeof json['message'] === 'string' && json['message']) ||
        `Cashfree ${path} failed (${response.status})`;
      this.logger.warn(
        { path, status: response.status, message },
        'Cashfree Subscriptions API error — merchant Subscriptions product may not be activated',
      );
      throw new BadRequestException(message);
    }
    return json;
  }
}
