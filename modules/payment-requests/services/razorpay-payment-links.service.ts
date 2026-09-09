import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import Razorpay = require('razorpay');

@Injectable()
export class RazorpayPaymentLinksService {
  private readonly logger = new Logger(RazorpayPaymentLinksService.name);
  private readonly client: Razorpay | null = null;
  private readonly webhookSecret: string;
  private readonly callbackUrl: string;

  private readonly expiryMinutes: number;

  constructor(private readonly configService: ConfigService) {
    const keyId = this.configService.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.configService.get<string>('RAZORPAY_SECRET');
    this.webhookSecret = this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET') ?? '';
    this.expiryMinutes = Number(this.configService.get<string>('RAZORPAY_PAYMENT_LINK_EXPIRY_MINUTES') ?? '4320');
    this.callbackUrl = this.configService.get<string>('RAZORPAY_CALLBACK_URL') ?? '';

    if (!keyId || !keySecret) {
      this.logger.warn('RAZORPAY_KEY_ID or RAZORPAY_SECRET is missing. Razorpay payment link integration will be inactive.');
    } else {
      this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    }
  }

  getCallbackUrl(): string | null {
    return this.callbackUrl.trim() || null;
  }
  getKeyId(): string {
    const keyId = this.configService.get<string>('RAZORPAY_KEY_ID');
    if (!keyId) {
      throw new InternalServerErrorException('RAZORPAY_KEY_ID is not configured.');
    }
    return keyId;
  }

  /**
   * Calculates link expiry timestamp in seconds (UNIX time) as required by Razorpay API.
   * Expire time must be at least 16 minutes in the future.
   */
  getLinkExpiryTimestamp(): number {
    const nowMs = Date.now();
    const expiryMs = nowMs + this.expiryMinutes * 60 * 1000;
    return Math.floor(expiryMs / 1000);
  }


  async createOrder(payload: {
    amount: number;
    currency: string;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<Record<string, unknown>> {
    if (!this.client) {
      throw new InternalServerErrorException(
        'Razorpay client is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_SECRET in environment.',
      );
    }
    try {
      return (await (this.client.orders.create as (input: unknown) => Promise<unknown>)(
        payload,
      )) as Record<string, unknown>;
    } catch (error) {
      this.logger.error('Failed to create Razorpay order', error instanceof Error ? error.stack : undefined);
      throw new InternalServerErrorException('Failed to create Razorpay order');
    }
  }

  verifyPaymentSignature(orderId: string, paymentId: string, signature: string | undefined): void {
    if (!signature) {
      throw new BadRequestException('Missing Razorpay payment signature');
    }
    const keySecret = this.configService.get<string>('RAZORPAY_SECRET');
    if (!keySecret) {
      throw new InternalServerErrorException('RAZORPAY_SECRET is not configured.');
    }
    const digest = createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    const expected = Buffer.from(digest);
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new BadRequestException('Invalid Razorpay payment signature');
    }
  }

  async createPaymentLink(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.client) {
      throw new InternalServerErrorException('Razorpay client is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_SECRET in environment.');
    }
    try {
      return (await (this.client.paymentLink.create as (input: unknown) => Promise<unknown>)(
        payload,
      )) as Record<string, unknown>;
    } catch (error) {
      const description = this.extractRazorpayError(error);
      this.logger.error(
        { error: description },
        'Failed to create payment link',
      );
      throw new BadRequestException(description);
    }
  }

  async cancelPaymentLink(linkId: string) {
    if (!this.client) {
      this.logger.warn('Razorpay client not configured; skipping payment link cancel request');
      return null;
    }
    try {
      return await this.client.paymentLink.cancel(linkId);
    } catch (error) {
      this.logger.warn(`Failed to cancel payment link ${linkId}`);
      return null;
    }
  }


  async createRefund(params: {
    paymentId: string;
    amount: number;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<Record<string, unknown>> {
    if (!this.client) {
      throw new InternalServerErrorException(
        'Razorpay client is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_SECRET in environment.',
      );
    }
    const amountPaise = Math.round(params.amount * 100);
    try {
      return (await (
        this.client.payments.refund as (
          paymentId: string,
          input: unknown,
        ) => Promise<unknown>
      )(params.paymentId, {
        amount: amountPaise,
        speed: 'normal',
        receipt: params.receipt,
        notes: params.notes ?? {},
      })) as Record<string, unknown>;
    } catch (error) {
      const description = this.extractRazorpayError(error);
      this.logger.error({ error: description, receipt: params.receipt }, 'Failed to create Razorpay refund');
      throw new BadRequestException(description);
    }
  }

  async fetchRefund(refundId: string): Promise<Record<string, unknown>> {
    if (!this.client) {
      throw new InternalServerErrorException(
        'Razorpay client is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_SECRET in environment.',
      );
    }
    try {
      return (await (this.client.refunds.fetch as (id: string) => Promise<unknown>)(
        refundId,
      )) as Record<string, unknown>;
    } catch (error) {
      const description = this.extractRazorpayError(error);
      this.logger.error({ error: description, refundId }, 'Failed to fetch Razorpay refund');
      throw new BadRequestException(description);
    }
  }

  verifyWebhookSignature(rawBody: string, signature: string | undefined): void {
    if (!signature) {
      throw new BadRequestException('Missing Razorpay signature');
    }

    const digest = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    const expected = Buffer.from(digest);
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new BadRequestException('Invalid Razorpay webhook signature');
    }
  }

  private extractRazorpayError(error: unknown): string {
    if (error && typeof error === 'object') {
      const razorpayError = error as {
        error?: { description?: string; code?: string };
        message?: string;
      };
      if (razorpayError.error?.description) {
        return razorpayError.error.description;
      }
      if (razorpayError.message) {
        return razorpayError.message;
      }
    }
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'Failed to generate Razorpay payment link';
  }
}
