import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import Razorpay from 'razorpay';

@Injectable()
export class RazorpayPaymentLinksService {
  private readonly logger = new Logger(RazorpayPaymentLinksService.name);
  private readonly client: Razorpay;
  private readonly webhookSecret: string;

  private readonly expiryHours: number;

  constructor(private readonly configService: ConfigService) {
    const keyId = this.configService.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.configService.get<string>('RAZORPAY_SECRET');
    this.webhookSecret = this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET') ?? '';
    this.expiryHours = Number(this.configService.get<string>('RAZORPAY_PAYMENT_LINK_EXPIRY_HOURS') ?? '72');

    if (!keyId || !keySecret) {
      throw new Error('RAZORPAY_KEY_ID and RAZORPAY_SECRET are required');
    }

    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  /**
   * Calculates link expiry timestamp in seconds (UNIX time) as required by Razorpay API.
   * Expire time must be at least 16 minutes in the future.
   */
  getLinkExpiryTimestamp(): number {
    const nowMs = Date.now();
    const expiryMs = nowMs + this.expiryHours * 60 * 60 * 1000;
    return Math.floor(expiryMs / 1000);
  }


  async createPaymentLink(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
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
