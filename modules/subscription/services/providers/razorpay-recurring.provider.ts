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
  MandateStatusSnapshot,
} from '../../interfaces/subscription-mandate-provider.interface';
import { mapRazorpayTokenStatus } from '../../utils/subscription-mandate-status.util';
import { classifyRazorpayPaymentStatus } from '../../utils/razorpay-upi-debit.util';

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
    const requestedPaise = Math.round(Number(input.authorizationAmount ?? 1) * 100);
    const productPaise = Math.max(100, requestedPaise);
    const method =
      input.method === 'card' ? 'card' : input.method === 'emandate' ? 'emandate' : 'upi';
    // Razorpay registers a card token only on a ₹1 authorisation, and a netbanking
    // eMandate only on a ₹0 authorisation. The subscription amount is charged on that token next.
    const chargePaise = method === 'card' ? 100 : method === 'emandate' ? 0 : productPaise;
    if (!Number.isFinite(maxPaise) || maxPaise < productPaise) {
      throw new BadRequestException('First charge is above the AutoPay mandate limit');
    }
    const expireAt = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 60 * 60;
    const order = await this.request('POST', '/orders', {
      amount: chargePaise,
      currency: input.currency ?? 'INR',
      customer_id: customerId,
      method,
      receipt: `man-${input.subscriptionId}`.slice(0, 40),
      notes: input.notes,
      ...(method === 'emandate' ? { payment_capture: true } : {}),
      token:
        method === 'emandate'
          ? {
              auth_type: 'netbanking',
              max_amount: maxPaise,
              expire_at: expireAt,
            }
          : {
              max_amount: maxPaise,
              expire_at: expireAt,
              frequency: 'as_presented',
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
      amountPaise: chargePaise,
      currency: input.currency ?? 'INR',
      checkoutPayload: {
        key: this.keyId,
        order_id: orderId,
        customer_id: customerId,
        recurring: '1',
        amount: chargePaise,
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
    let customerId = params.gatewayCustomerId ?? null;
    let tokenId = params.gatewayMandateId ?? null;

    if (params.gatewayPaymentId) {
      const payment = await this.request('GET', `/payments/${params.gatewayPaymentId}`);
      tokenId = readRazorpayTokenId(payment) ?? tokenId;
      customerId = customerId ?? (String(payment['customer_id'] ?? '') || null);
      const tokenStatus =
        typeof payment['token'] === 'object' && payment['token']
          ? String((payment['token'] as Record<string, unknown>)['recurring_status'] ?? '')
          : '';
      if (tokenId) {
        return {
          status: mapRazorpayTokenStatus(tokenStatus || 'confirmed'),
          gatewayMandateId: tokenId,
          gatewayCustomerId: customerId,
          raw: payment,
        };
      }
    }

    if (customerId) {
      const tokens = await this.request('GET', `/customers/${customerId}/tokens`);
      const items = Array.isArray(tokens['items'])
        ? (tokens['items'] as Record<string, unknown>[])
        : [];
      const token = tokenId
        ? items.find((item) => String(item['id']) === tokenId)
        : items.find((item) =>
            ['confirmed', 'authorized'].includes(
              String(item['recurring_status'] ?? item['status'] ?? '').toLowerCase(),
            ),
          );
      const resolvedId = token ? String(token['id'] ?? '') || tokenId : tokenId;
      return {
        status: mapRazorpayTokenStatus(
          String(token?.['recurring_status'] ?? token?.['status'] ?? (resolvedId ? 'confirmed' : 'pending')),
        ),
        gatewayMandateId: resolvedId,
        gatewayCustomerId: customerId,
        raw: token ?? tokens,
      };
    }

    return { status: mapRazorpayTokenStatus('pending'), gatewayMandateId: tokenId, gatewayCustomerId: customerId };
  }

  async charge(input: ChargeMandateInput): Promise<AutopayChargeResult> {
    this.assertConfigured();
    const amountPaise = Math.round(Number(input.amount) * 100);
    const paymentAfter = input.debitAt ? Math.floor(input.debitAt.getTime() / 1000) : null;
    // Razorpay Orders use `receipt` as the idempotency key. There is no idempotency
    // header on /orders or /payments/create/recurring (those headers exist only for
    // Payouts and Route transfers). The stored subscription idempotency key is not sent.
    const receipt = input.receipt.slice(0, 40);
    const orderBody: Record<string, unknown> = {
      amount: amountPaise,
      currency: input.currency ?? 'INR',
      payment_capture: true,
      receipt,
      notes: input.notes,
      ...(paymentAfter && input.gatewayMandateId
        ? { notification: { token_id: input.gatewayMandateId, payment_after: paymentAfter } }
        : {}),
    };

    let order: Record<string, unknown> | null = null;
    try {
      order = await this.request('POST', '/orders', orderBody);
    } catch (error) {
      if (this.isDuplicateReceipt(error)) {
        order = await this.findOrderByReceipt(receipt);
      }
      if (!order) {
        const message = error instanceof Error ? error.message : String(error);
        if (this.isUnknownTransport(message)) {
          return { accepted: true, pending: true, failureReason: message };
        }
        return { accepted: false, pending: false, failureReason: message };
      }
    }

    const orderId = String(order['id'] ?? '');
    if (!orderId) {
      return { accepted: false, pending: false, failureReason: 'Razorpay order missing id', raw: order };
    }

    const existing = await this.readOrderPayments(orderId).catch(() => null);
    if (!existing) {
      return {
        accepted: true,
        pending: true,
        gatewayOrderId: orderId,
        failureReason: 'Razorpay payment status is unknown',
      };
    }
    const open = paymentSnapshot(existing, orderId);
    if (open) return snapshotToCharge(open, orderId);

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
      return snapshotToCharge(paymentSnapshot([payment], orderId) ?? {
        state: 'unknown',
        gatewayOrderId: orderId,
        gatewayPaymentId: String(payment['id'] ?? '') || null,
      }, orderId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ orderId, error: message }, 'Razorpay recurring charge did not complete');
      // The order exists. A second create/recurring could debit twice, so leave it unknown.
      return { accepted: true, pending: true, gatewayOrderId: orderId, failureReason: message };
    }
  }

  async fetchChargeStatus(params: {
    gatewayOrderId?: string | null;
    gatewayPaymentId?: string | null;
  }): Promise<GatewayChargeSnapshot> {
    this.assertConfigured();
    try {
      if (params.gatewayPaymentId) {
        const payment = await this.request('GET', `/payments/${params.gatewayPaymentId}`);
        const paymentOrderId = String(payment['order_id'] ?? '');
        const requestedOrderId = params.gatewayOrderId ?? '';
        if (!requestedOrderId || !paymentOrderId || paymentOrderId === requestedOrderId) {
          return (
            paymentSnapshot([payment], requestedOrderId || paymentOrderId) ?? {
              state: 'unknown',
              gatewayOrderId: requestedOrderId || paymentOrderId,
              gatewayPaymentId: params.gatewayPaymentId,
            }
          );
        }
      }
      if (params.gatewayOrderId) {
        const items = await this.readOrderPayments(params.gatewayOrderId);
        return (
          paymentSnapshot(items, params.gatewayOrderId) ?? {
            state: 'unknown',
            gatewayOrderId: params.gatewayOrderId,
          }
        );
      }
      return { state: 'unknown' };
    } catch (error) {
      this.logger.warn(
        {
          gatewayOrderId: params.gatewayOrderId,
          gatewayPaymentId: params.gatewayPaymentId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Razorpay charge status could not be read',
      );
      return {
        state: 'unknown',
        gatewayOrderId: params.gatewayOrderId,
        gatewayPaymentId: params.gatewayPaymentId,
      };
    }
  }

  /**
   * Successful empty list means Razorpay has no order for this receipt.
   * A transport or API error stays unknown so the caller does not start another charge.
   */
  async lookupChargeByReceipt(receipt: string): Promise<
    | { outcome: 'absent' }
    | { outcome: 'unknown' }
    | { outcome: 'found'; snapshot: GatewayChargeSnapshot }
  > {
    this.assertConfigured();
    try {
      const listed = await this.request('GET', `/orders?receipt=${encodeURIComponent(receipt)}`);
      const items = Array.isArray(listed['items']) ? (listed['items'] as Record<string, unknown>[]) : [];
      const order = items.find((item) => String(item['receipt'] ?? '') === receipt) ?? null;
      const orderId = order ? String(order['id'] ?? '') : '';
      if (!orderId) return { outcome: 'absent' };
      const payments = await this.readOrderPayments(orderId).catch(() => null);
      if (!payments) return { outcome: 'found', snapshot: { state: 'unknown', gatewayOrderId: orderId } };
      return {
        outcome: 'found',
        snapshot: paymentSnapshot(payments, orderId) ?? { state: 'unknown', gatewayOrderId: orderId },
      };
    } catch (error) {
      this.logger.warn(
        { receipt, error: error instanceof Error ? error.message : String(error) },
        'Razorpay receipt lookup could not be completed',
      );
      return { outcome: 'unknown' };
    }
  }

  private isDuplicateReceipt(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /receipt/i.test(message) && /already/i.test(message);
  }

  private isUnknownTransport(message: string): boolean {
    return /timeout|ECONNRESET|fetch failed|network/i.test(message);
  }

  private async findOrderByReceipt(receipt: string): Promise<Record<string, unknown> | null> {
    try {
      const listed = await this.request('GET', `/orders?receipt=${encodeURIComponent(receipt)}`);
      const items = Array.isArray(listed['items']) ? (listed['items'] as Record<string, unknown>[]) : [];
      return items.find((item) => String(item['receipt'] ?? '') === receipt) ?? items[0] ?? null;
    } catch (error) {
      this.logger.warn(
        { receipt, error: error instanceof Error ? error.message : String(error) },
        'Razorpay duplicate receipt could not be resolved',
      );
      return null;
    }
  }

  private async readOrderPayments(orderId: string): Promise<Record<string, unknown>[]> {
    const listed = await this.request('GET', `/orders/${orderId}/payments`);
    return Array.isArray(listed['items']) ? (listed['items'] as Record<string, unknown>[]) : [];
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
      const duplicateReceipt = /receipt/i.test(description) && /already/i.test(description);
      this.logger.warn(
        { path, status: response.status, description },
        duplicateReceipt
          ? 'Razorpay order receipt already exists; the existing order will be reused'
          : 'Razorpay Recurring API error',
      );
      throw new BadRequestException(description);
    }
    return json;
  }
}

function paymentSnapshot(
  items: Record<string, unknown>[],
  orderId: string,
): GatewayChargeSnapshot | null {
  if (!items.length) return null;
  const ranked = items.map((item) => ({
    item,
    state: classifyRazorpayPaymentStatus(
      typeof item['status'] === 'string' ? item['status'] : null,
    ),
  }));
  const captured = ranked.find((row) => row.state === 'captured');
  const pending = ranked.find((row) => row.state === 'pending');
  const chosen = captured ?? pending ?? (ranked.every((row) => row.state === 'failed') ? ranked[0] : null);
  if (!chosen || chosen.state === 'unknown') {
    return {
      state: 'unknown',
      gatewayOrderId: orderId,
      gatewayPaymentId: String(items[0]?.['id'] ?? items[0]?.['razorpay_payment_id'] ?? '') || null,
    };
  }
  return {
    state: chosen.state,
    gatewayOrderId: orderId || String(chosen.item['order_id'] ?? chosen.item['razorpay_order_id'] ?? '') || null,
    gatewayPaymentId: String(chosen.item['id'] ?? chosen.item['razorpay_payment_id'] ?? '') || null,
    amount: rupeesFromPaise(chosen.item['amount']),
    failureReason:
      chosen.state === 'failed'
        ? String(chosen.item['error_description'] ?? chosen.item['status'] ?? 'Razorpay recurring payment failed')
        : null,
  };
}

function snapshotToCharge(snapshot: GatewayChargeSnapshot, orderId: string): AutopayChargeResult {
  const gatewayOrderId = snapshot.gatewayOrderId || orderId;
  if (snapshot.state === 'captured') {
    return {
      accepted: true,
      pending: false,
      gatewayOrderId,
      gatewayPaymentId: snapshot.gatewayPaymentId,
    };
  }
  if (snapshot.state === 'failed') {
    return {
      accepted: false,
      pending: false,
      gatewayOrderId,
      gatewayPaymentId: snapshot.gatewayPaymentId,
      failureReason: snapshot.failureReason ?? 'Razorpay recurring payment failed',
    };
  }
  return {
    accepted: true,
    pending: true,
    gatewayOrderId,
    gatewayPaymentId: snapshot.gatewayPaymentId,
    failureReason: snapshot.state === 'unknown' ? 'Razorpay payment status is unknown' : null,
  };
}

function rupeesFromPaise(amount: unknown): string | null {
  const paise = Number(amount);
  if (!Number.isFinite(paise)) return null;
  return (paise / 100).toFixed(2);
}

function readRazorpayTokenId(payment: Record<string, unknown>): string | null {
  if (typeof payment['token_id'] === 'string' && payment['token_id']) return payment['token_id'];
  const token = payment['token'];
  if (typeof token === 'string' && token) return token;
  if (token && typeof token === 'object') {
    const id = (token as Record<string, unknown>)['id'];
    if (typeof id === 'string' && id) return id;
  }
  return null;
}
