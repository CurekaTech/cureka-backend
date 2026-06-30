import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import Razorpay = require('razorpay');

@Injectable()
export class RazorpayPaymentLinksService {
  private readonly logger = new Logger(RazorpayPaymentLinksService.name);
  private readonly client: Razorpay | null = null;
  private readonly webhookSecret: string;

  private readonly expiryMinutes: number;

  constructor(private readonly configService: ConfigService) {
    const keyId = this.configService.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.configService.get<string>('RAZORPAY_SECRET');
    this.webhookSecret = this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET') ?? '';
    this.expiryMinutes = Number(this.configService.get<string>('RAZORPAY_PAYMENT_LINK_EXPIRY_MINUTES') ?? '4320');

    if (!keyId || !keySecret) {
      this.logger.warn('RAZORPAY_KEY_ID or RAZORPAY_SECRET is missing. Razorpay payment link integration will be inactive.');
    } else {
      this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    }
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


  async createPaymentLink(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.client) {
      throw new InternalServerErrorException('Razorpay client is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_SECRET in environment.');
    }
    try {
      return (await (this.client.paymentLink.create as (input: unknown) => Promise<unknown>)(
        payload,
      )) as Record<string, unknown>;
    } catch (error) {
      this.logger.error('Failed to create payment link', error instanceof Error ? error.stack : undefined);
      throw new InternalServerErrorException('Failed to generate Razorpay payment link');
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
}
