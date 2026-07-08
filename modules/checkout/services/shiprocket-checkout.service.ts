import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  ICreateShiprocketCheckoutSessionInput,
  IShiprocketCheckoutSession,
  IShiprocketPaymentVerificationResult,
} from '../interfaces/checkout-provider.interface';

@Injectable()
export class ShiprocketCheckoutService {
  private readonly logger = new Logger(ShiprocketCheckoutService.name);
  private readonly email: string;
  private readonly licenseKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly checkoutSessionPath: string;
  private readonly checkoutVerifyPath: string;
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.email = this.configService.get<string>('shiprocket.email') ?? '';
    this.licenseKey = this.configService.get<string>('shiprocket.licenseKey') ?? '';
    this.baseUrl = (this.configService.get<string>('shiprocket.baseUrl') ?? 'https://app.shipway.com').replace(/\/+$/, '');
    this.timeoutMs = this.configService.get<number>('shiprocket.timeoutMs') ?? 15000;
    this.checkoutSessionPath = this.configService.get<string>('shiprocket.checkoutSessionPath') ?? '/api/checkout/session';
    this.checkoutVerifyPath = this.configService.get<string>('shiprocket.checkoutVerifyPath') ?? '/api/checkout/session/:sessionId';
    this.webhookSecret = this.configService.get<string>('shiprocket.webhookSecret') ?? '';
  }

  async createSession(input: ICreateShiprocketCheckoutSessionInput): Promise<IShiprocketCheckoutSession> {
    const payload = {
      order_id: input.merchantOrderId,
      payment_request_id: input.paymentRequestId,
      amount: input.amount,
      currency: input.currency,
      customer: input.customer,
      shipping_address: input.shippingAddress,
      items: input.items,
      success_url: input.successUrl,
      failure_url: input.failureUrl,
      metadata: input.metadata,
    };

    const response = await this.request<Record<string, unknown>>(this.checkoutSessionPath, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const sessionId = this.readString(response, ['session_id', 'sessionId', 'id', 'checkout_session_id']);
    const checkoutUrl = this.readString(response, ['checkout_url', 'checkoutUrl', 'url', 'redirect_url']);
    if (!sessionId || !checkoutUrl) {
      this.logger.error({ response }, 'Shiprocket Checkout session response missing sessionId or checkoutUrl');
      throw new ServiceUnavailableException('Shiprocket Checkout session creation failed');
    }

    return {
      sessionId,
      checkoutUrl,
      expiresAt: this.readDate(response, ['expires_at', 'expiresAt']),
      raw: response,
    };
  }

  async verifyPayment(sessionId: string): Promise<IShiprocketPaymentVerificationResult> {
    const path = this.checkoutVerifyPath.replace(':sessionId', encodeURIComponent(sessionId));
    const response = await this.request<Record<string, unknown>>(path, { method: 'GET' });
    const status = this.readString(response, ['payment_status', 'status', 'order_status'])?.toLowerCase();
    const paymentId = this.readString(response, ['payment_id', 'paymentId', 'razorpay_payment_id', 'transaction_id']);

    return {
      paid: ['paid', 'success', 'successful', 'completed', 'captured'].includes(status ?? ''),
      paymentId,
      status,
      raw: response,
    };
  }

  verifyCallbackSignature(rawBody: string, signature?: string): void {
    if (!this.webhookSecret) {
      return;
    }
    if (!signature) {
      throw new BadRequestException('Missing Shiprocket Checkout signature');
    }

    const expectedDigest = createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');
    const expected = Buffer.from(expectedDigest);
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new BadRequestException('Invalid Shiprocket Checkout signature');
    }
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    if (!this.email || !this.licenseKey) {
      throw new ServiceUnavailableException('Shiprocket Checkout credentials are not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    try {
      this.logger.log({ method: init.method ?? 'GET', url }, 'Shiprocket Checkout API request');
      const response = await fetch(url, {
        ...init,
        headers: {
          Authorization: this.buildAuthHeader(),
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });

      const text = await response.text();
      const data = (text ? JSON.parse(text) : {}) as T & { message?: string; error?: string };

      this.logger.log({ url, status: response.status, ok: response.ok }, 'Shiprocket Checkout API response');
      if (!response.ok) {
        throw new ServiceUnavailableException(data.message ?? data.error ?? `Shiprocket Checkout request failed with HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Shiprocket Checkout API request failed: ${message}`);
      throw new ServiceUnavailableException('Shiprocket Checkout is unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildAuthHeader(): string {
    return `Basic ${Buffer.from(`${this.email}:${this.licenseKey}`).toString('base64')}`;
  }

  private readString(source: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
      if (typeof value === 'number') {
        return String(value);
      }
    }
    return undefined;
  }

  private readDate(source: Record<string, unknown>, keys: string[]): Date | null {
    const value = this.readString(source, keys);
    if (!value) {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
