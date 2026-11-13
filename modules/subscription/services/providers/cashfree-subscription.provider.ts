import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionMandateProvider } from '../../enums/subscription-mandate-provider.enum';
import {
  AutopayChargeResult,
  ChargeMandateInput,
  CreateMandateAuthInput,
  GatewayChargeSnapshot,
  ISubscriptionMandateProvider,
  MandateAuthSession,
  MandateCancelResult,
  MandateStatusSnapshot,
} from '../../interfaces/subscription-mandate-provider.interface';
import {
  formatCashfreeScheduleDate,
  nextCashfreeUpiScheduleDate,
} from '../../utils/cashfree-schedule-date.util';
import { toCashfreeMerchantPaymentId } from '../../utils/cashfree-payment-id.util';
import { resolveCashfreeMerchantSubscriptionId } from '../../utils/cashfree-subscription-id.util';
import { cashfreeSubscriptionHostedCheckoutUrl } from '@modules/payment-requests/utils/cashfree-checkout-url.util';
import { AUTOPAY_TRACE, formatIstDate } from '../../utils/autopay-trace.util';
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
      authorization_amount: Number(input.authorizationAmount ?? 1),
      authorization_amount_refund: !input.authorizationAmount,
      payment_methods: ['upi', 'enach', 'card'],
    },
      subscription_meta: {
        return_url: input.returnUrl,
      },
      subscription_tags: input.notes,
    };
    const created = await this.request('POST', '/subscriptions', body, {
      'x-idempotency-key': `cf-sub-create:${input.subscriptionId}`.slice(0, 64),
    });
    const sessionId = String(created['subscription_session_id'] ?? '');
    const merchantId = String(created['subscription_id'] ?? subscriptionId);
    const cfId = String(created['cf_subscription_id'] ?? '');
    if (!sessionId && !merchantId) {
      throw new BadRequestException('Cashfree subscription create did not return a session');
    }
    const env = (this.configService.get<string>('CASHFREE_ENV') ?? 'sandbox').toLowerCase();
    const environment = env === 'production' ? 'production' : 'sandbox';
    return {
      provider: this.provider,
      authorizationOrderId: merchantId,
      gatewaySubscriptionId: merchantId,
      gatewayMandateId: cfId || null,
      currency: input.currency ?? 'INR',
      amountPaise: Math.round(Number(input.authorizationAmount ?? 1) * 100),
      paymentSessionId: sessionId || null,
      authorizationLink: sessionId
        ? cashfreeSubscriptionHostedCheckoutUrl(
            sessionId,
            environment,
            this.configService.get<string>('API_PUBLIC_URL') ||
              this.configService.get<string>('STOREFRONT_URL'),
          )
        : null,
      checkoutPayload: {
        subscription_session_id: sessionId,
        paymentSessionId: sessionId,
        subscription_id: merchantId,
        cf_subscription_id: cfId,
        environment,
        subscriptionCheckout: true,
      },
    };
  }

  async fetchMandateStatus(params: {
    gatewaySubscriptionId?: string | null;
  }): Promise<MandateStatusSnapshot> {
    this.assertConfigured();
    const merchantId = this.requireMerchantSubscriptionId(
      params.gatewaySubscriptionId,
      'fetchMandateStatus',
    );
    if (!merchantId) {
      return { status: mapCashfreeSubscriptionStatus('INITIALIZED'), gatewayRead: false };
    }
    const details = await this.request(
      'GET',
      `/subscriptions/${encodeURIComponent(merchantId)}`,
    );
    return {
      status: mapCashfreeSubscriptionStatus(String(details['subscription_status'] ?? '')),
      gatewaySubscriptionId: String(details['subscription_id'] ?? merchantId),
      gatewayMandateId: String(details['cf_subscription_id'] ?? '') || null,
      raw: details,
      gatewayRead: true,
    };
  }

  async charge(input: ChargeMandateInput): Promise<AutopayChargeResult> {
    this.assertConfigured();
    const subscriptionId = this.requireMerchantSubscriptionId(
      input.gatewaySubscriptionId,
      'charge',
    );
    if (!subscriptionId) {
      return {
        accepted: false,
        pending: false,
        failureReason:
          'Cashfree merchant subscription_id is required (sub_…). A numeric cf_subscription_id cannot be charged.',
      };
    }
    const scheduleDate = input.scheduleDate ?? nextCashfreeUpiScheduleDate();
    const scheduleIst = formatCashfreeScheduleDate(scheduleDate);
    const merchantPaymentId = toCashfreeMerchantPaymentId(input.idempotencyKey);
    const existing = await this.fetchChargeStatus({
      gatewaySubscriptionId: subscriptionId,
      gatewayOrderId: merchantPaymentId,
    });
    if (existing.state === 'pending' || existing.state === 'captured') {
      this.logger.log(
        {
          event: AUTOPAY_TRACE,
          phase: 'cashfree_pay_reuse',
          merchantSubscriptionId: subscriptionId,
          paymentAmount: input.amount,
          paymentId: merchantPaymentId,
          gatewayPaymentId: existing.gatewayPaymentId ?? null,
          paymentStatus: existing.state,
          scheduleIst,
          nowIst: formatIstDate(new Date()),
        },
        `${AUTOPAY_TRACE} Cashfree CHARGE already exists for this payment_id; POST skipped`,
      );
      return {
        accepted: true,
        pending: existing.state === 'pending',
        gatewayOrderId: existing.gatewayOrderId ?? merchantPaymentId,
        gatewayPaymentId: existing.gatewayPaymentId ?? null,
      };
    }
    this.logger.log(
      {
        event: AUTOPAY_TRACE,
        phase: 'cashfree_pay_request',
        merchantSubscriptionId: subscriptionId,
        paymentAmount: input.amount,
        paymentType: 'CHARGE',
        paymentId: merchantPaymentId,
        idempotencyKey: input.idempotencyKey,
        scheduleIst,
        nowIst: formatIstDate(new Date()),
      },
      `${AUTOPAY_TRACE} POST /subscriptions/pay CHARGE`,
    );
    try {
      const payment = await this.request(
        'POST',
        '/subscriptions/pay',
        {
          subscription_id: subscriptionId,
          payment_id: merchantPaymentId,
          payment_amount: Number(input.amount),
          payment_type: 'CHARGE',
          payment_schedule_date: scheduleIst,
        },
        { 'x-idempotency-key': merchantPaymentId },
      );
      const status = String(payment['payment_status'] ?? payment['status'] ?? '').toUpperCase();
      this.logger.log(
        {
          event: AUTOPAY_TRACE,
          phase: 'cashfree_pay_response',
          merchantSubscriptionId: subscriptionId,
          paymentAmount: input.amount,
          scheduleIst,
          nowIst: formatIstDate(new Date()),
          paymentStatus: status || null,
          gatewayOrderId: String(payment['payment_id'] ?? '') || null,
          gatewayPaymentId: String(payment['cf_payment_id'] ?? '') || null,
          failureReason: String(payment['failure_reason'] ?? '') || null,
        },
        `${AUTOPAY_TRACE} Cashfree CHARGE response`,
      );
      if (!status) {
        return {
          accepted: true,
          pending: true,
          gatewayOrderId: String(payment['payment_id'] ?? '') || null,
          gatewayPaymentId: String(payment['cf_payment_id'] ?? '') || null,
          raw: payment,
        };
      }
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
      this.logger.warn(
        {
          event: AUTOPAY_TRACE,
          phase: 'cashfree_pay_error',
          merchantSubscriptionId: subscriptionId,
          paymentAmount: input.amount,
          scheduleIst,
          nowIst: formatIstDate(new Date()),
          error: message,
        },
        `${AUTOPAY_TRACE} Cashfree CHARGE request failed`,
      );
      if (/timeout|ECONNRESET|fetch failed|network|aborted|failed \(5\d\d\)/i.test(message)) {
        return { accepted: true, pending: true, failureReason: message };
      }
      return { accepted: false, pending: false, failureReason: message };
    }
  }

  async fetchChargeStatus(params: {
    gatewayOrderId?: string | null;
    gatewayPaymentId?: string | null;
    gatewaySubscriptionId?: string | null;
    matchSingleCaptured?: boolean;
    expectedAmount?: string | null;
    expectedCurrency?: string | null;
  }): Promise<GatewayChargeSnapshot> {
    const merchantId = resolveCashfreeMerchantSubscriptionId(params.gatewaySubscriptionId);
    if (!this.isConfigured() || !merchantId) {
      if (params.gatewaySubscriptionId && !merchantId) {
        this.logger.warn(
          { gatewaySubscriptionId: params.gatewaySubscriptionId },
          'Cashfree payment list skipped — numeric cf_subscription_id is not a merchant subscription_id',
        );
      }
      return {
        state: 'unknown',
        gatewayOrderId: params.gatewayOrderId,
        gatewayPaymentId: params.gatewayPaymentId,
      };
    }
    try {
      const listed = await this.request(
        'GET',
        `/subscriptions/${encodeURIComponent(merchantId)}/payments`,
      );
      const rows = cashfreePaymentRows(listed);
      const wanted = [params.gatewayOrderId, params.gatewayPaymentId]
        .map((value) => (value == null ? '' : String(value).trim()))
        .filter((value) => value.length > 0);
      const captured = rows.filter((row) => cashfreePaymentSnapshot(row).state === 'captured');
      const byId = wanted.length
        ? rows.find((row) => cashfreeRowIds(row).some((id) => wanted.includes(id)))
        : undefined;
      const soleChargeCaptured = cashfreeSoleNonAuthCaptured(captured);
      const amountMatchedCharge = cashfreeUniqueChargeMatchingAmount(captured, params);
      const soleCaptured =
        params.matchSingleCaptured && captured.length === 1 ? captured[0] : undefined;
      const match = byId ?? soleChargeCaptured ?? amountMatchedCharge ?? soleCaptured;
      if (!match) {
        this.logger.warn(
          {
            gatewaySubscriptionId: merchantId,
            rowCount: rows.length,
            capturedCount: captured.length,
            lookedUpPaymentId: wanted.length > 0,
            soleChargeCaptured: Boolean(soleChargeCaptured),
            amountMatchedCharge: Boolean(amountMatchedCharge),
          },
          'Cashfree subscription payment was not found in the payment list',
        );
        return {
          state: 'unknown',
          gatewayOrderId: params.gatewayOrderId,
          gatewayPaymentId: params.gatewayPaymentId,
        };
      }
      if (!byId && wanted.length > 0) {
        this.logger.log(
          {
            gatewaySubscriptionId: merchantId,
            rowCount: rows.length,
            capturedCount: captured.length,
            lookedUpPaymentId: true,
            usedSoleChargeFallback: Boolean(soleChargeCaptured),
            usedAmountMatch: Boolean(amountMatchedCharge && !soleChargeCaptured),
            usedMatchSingleCaptured: !soleChargeCaptured && !amountMatchedCharge,
          },
          'Cashfree subscription payment matched via sole captured CHARGE after id lookup missed',
        );
      }
      const snapshot = cashfreePaymentSnapshot(match);
      if (
        cashfreeIsAuthPayment(match) &&
        params.expectedAmount &&
        params.expectedCurrency &&
        (snapshot.amount == null ||
          snapshot.currency == null ||
          snapshot.currency.toUpperCase() !== params.expectedCurrency.trim().toUpperCase() ||
          Math.abs(Number(params.expectedAmount) - Number(snapshot.amount)) >= 0.009)
      ) {
        return {
          state: 'unknown',
          gatewayOrderId: params.gatewayOrderId,
          gatewayPaymentId: params.gatewayPaymentId,
        };
      }
      return snapshot;
    } catch (error) {
      this.logger.warn(
        {
          gatewaySubscriptionId: merchantId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Cashfree subscription payment status could not be read',
      );
      return {
        state: 'unknown',
        gatewayOrderId: params.gatewayOrderId,
        gatewayPaymentId: params.gatewayPaymentId,
      };
    }
  }

  /**
   * Cancels the Cashfree subscription so no further on-demand charges are raised.
   * A missing subscription id means the mandate was never created at Cashfree.
   */
  async cancelMandate(params: {
    gatewaySubscriptionId?: string | null;
  }): Promise<MandateCancelResult> {
    this.assertConfigured();
    const subscriptionId = this.requireMerchantSubscriptionId(
      params.gatewaySubscriptionId,
      'cancelMandate',
    );
    if (!subscriptionId) return { cancelled: true };
    try {
      await this.request('POST', `/subscriptions/${encodeURIComponent(subscriptionId)}/manage`, {
        action: 'CANCEL',
      });
      return { cancelled: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already|cancelled|canceled|does not exist|not found/i.test(message)) return { cancelled: true };
      return { cancelled: false, failureReason: message };
    }
  }

  private requireMerchantSubscriptionId(
    value: string | null | undefined,
    operation: string,
  ): string | undefined {
    const merchantId = resolveCashfreeMerchantSubscriptionId(value);
    if (merchantId) return merchantId;
    if (value?.trim()) {
      this.logger.warn(
        { given: value.trim(), operation },
        'Cashfree API skipped — numeric cf_subscription_id is not a merchant subscription_id',
      );
    }
    return undefined;
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
    extraHeaders?: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'x-client-id': this.appId,
        'x-client-secret': this.secretKey,
        'x-api-version': this.apiVersion,
        'Content-Type': 'application/json',
        ...extraHeaders,
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

function cashfreePaymentRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  const payments = payload['payments'] ?? payload['data'];
  if (Array.isArray(payments)) return payments.filter(isRecord);
  if (payload['payment_id'] || payload['cf_payment_id']) return [payload];
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cashfreeRowIds(row: Record<string, unknown>): string[] {
  const gateway = isRecord(row['payment_gateway_details']) ? row['payment_gateway_details'] : {};
  return [
    row['payment_id'],
    row['cf_payment_id'],
    row['cf_order_id'],
    row['order_id'],
    row['merchant_payment_id'],
    row['subscription_payment_id'],
    gateway['gateway_payment_id'],
    gateway['gateway_order_id'],
    gateway['payment_id'],
  ]
    .map((value) => (value == null ? '' : String(value).trim()))
    .filter((value) => value.length > 0);
}

/** Prefer a single non-AUTH SUCCESS payment so AUTH ₹ auth does not settle a product CHARGE. */
function cashfreeSoleNonAuthCaptured(captured: Record<string, unknown>[]): Record<string, unknown> | undefined {
  const charges = captured.filter((row) => !cashfreeIsAuthPayment(row));
  return charges.length === 1 ? charges[0] : undefined;
}

function cashfreeUniqueChargeMatchingAmount(
  captured: Record<string, unknown>[],
  params: { expectedAmount?: string | null; expectedCurrency?: string | null },
): Record<string, unknown> | undefined {
  const expectedAmount = params.expectedAmount?.trim();
  const expectedCurrency = params.expectedCurrency?.trim();
  if (!expectedAmount || !expectedCurrency) return undefined;
  const expected = Number(expectedAmount);
  if (!Number.isFinite(expected)) return undefined;
  const matches = captured.filter((row) => {
    if (cashfreeIsAuthPayment(row)) return false;
    const snapshot = cashfreePaymentSnapshot(row);
    if (snapshot.state !== 'captured' || snapshot.amount == null || !snapshot.currency) return false;
    if (snapshot.currency.toUpperCase() !== expectedCurrency.toUpperCase()) return false;
    const actual = Number(snapshot.amount);
    return Number.isFinite(actual) && Math.abs(expected - actual) < 0.009;
  });
  return matches.length === 1 ? matches[0] : undefined;
}

function cashfreeIsAuthPayment(row: Record<string, unknown>): boolean {
  return String(row['payment_type'] ?? '').trim().toUpperCase() === 'AUTH';
}

function cashfreePaymentSnapshot(payment: Record<string, unknown>): GatewayChargeSnapshot {
  const status = String(payment['payment_status'] ?? payment['status'] ?? '').toUpperCase();
  const amount = Number(payment['payment_amount']);
  const currency = cashfreePaymentCurrency(payment);
  const snapshot = {
    gatewayOrderId: String(payment['payment_id'] ?? '') || null,
    gatewayPaymentId: String(payment['cf_payment_id'] ?? '') || null,
    amount: Number.isFinite(amount) ? amount.toFixed(2) : null,
    paymentType: String(payment['payment_type'] ?? '').trim().toUpperCase() || null,
    ...(currency ? { currency } : {}),
  };
  if (['SUCCESS', 'PAID'].includes(status)) return { ...snapshot, state: 'captured' };
  if (['FAILED', 'CANCELLED', 'USER_DROPPED'].includes(status)) {
    return {
      ...snapshot,
      state: 'failed',
      failureReason: String(payment['failure_reason'] ?? payment['payment_message'] ?? status),
    };
  }
  if (['INITIALIZED', 'PENDING', 'ACTIVE'].includes(status)) return { ...snapshot, state: 'pending' };
  return { ...snapshot, state: 'unknown' };
}

function cashfreePaymentCurrency(payment: Record<string, unknown>): string | null {
  const value = payment['payment_currency'] ?? payment['currency'];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
