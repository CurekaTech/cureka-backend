import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

@Injectable()
export class CashfreePaymentService {
  private readonly logger = new Logger(CashfreePaymentService.name);
  private readonly appId: string;
  private readonly secretKey: string;
  private readonly env: string;
  private readonly apiVersion: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.appId = this.configService.get<string>('CASHFREE_APP_ID') ?? '';
    this.secretKey = this.configService.get<string>('CASHFREE_SECRET_KEY') ?? '';
    this.env = this.configService.get<string>('CASHFREE_ENV') ?? 'sandbox';
    this.apiVersion = this.configService.get<string>('CASHFREE_API_VERSION') ?? '2023-08-01';

    if (!this.appId || !this.secretKey) {
      this.logger.warn('CASHFREE_APP_ID or CASHFREE_SECRET_KEY is missing. Cashfree integration will be inactive.');
    }

    this.baseUrl = this.env === 'production'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';
  }

  getAppId(): string {
    return this.appId;
  }

  getEnv(): string {
    return this.env;
  }

  async createOrder(payload: {
    orderId: string;
    amount: number;
    currency: string;
    customer: {
      id: string;
      email?: string;
      phone: string;
      name?: string;
    };
    returnUrl: string;
  }): Promise<Record<string, any>> {
    if (!this.appId || !this.secretKey) {
      throw new InternalServerErrorException('Cashfree is not configured properly.');
    }

    const body = {
      order_id: payload.orderId,
      order_amount: payload.amount,
      order_currency: payload.currency,
      customer_details: {
        customer_id: payload.customer.id,
        customer_email: payload.customer.email || 'customer@cureka.com',
        customer_phone: payload.customer.phone,
        customer_name: payload.customer.name || 'Customer',
      },
      order_meta: {
        return_url: payload.returnUrl,
      },
    };

    try {
      const response = await fetch(`${this.baseUrl}/orders`, {
        method: 'POST',
        headers: {
          'x-client-id': this.appId,
          'x-client-secret': this.secretKey,
          'x-api-version': this.apiVersion,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const json = await response.json();
      if (!response.ok) {
        this.logger.error(`Cashfree create order failed: ${JSON.stringify(json)}`);
        throw new BadRequestException(json.message || 'Failed to create Cashfree order');
      }

      return json;
    } catch (error) {
      this.logger.error('Failed to create Cashfree order', error instanceof Error ? error.stack : undefined);
      throw error instanceof BadRequestException ? error : new InternalServerErrorException('Failed to create Cashfree order');
    }
  }

  async getOrder(orderId: string): Promise<Record<string, any>> {
    if (!this.appId || !this.secretKey) {
      throw new InternalServerErrorException('Cashfree is not configured properly.');
    }

    try {
      const response = await fetch(`${this.baseUrl}/orders/${orderId}`, {
        method: 'GET',
        headers: {
          'x-client-id': this.appId,
          'x-client-secret': this.secretKey,
          'x-api-version': this.apiVersion,
        },
      });

      const json = await response.json();
      if (!response.ok) {
        this.logger.error(`Cashfree get order failed: ${JSON.stringify(json)}`);
        throw new BadRequestException(json.message || 'Failed to fetch Cashfree order status');
      }

      return json;
    } catch (error) {
      this.logger.error(`Failed to get Cashfree order status for ${orderId}`, error instanceof Error ? error.stack : undefined);
      throw error instanceof BadRequestException ? error : new InternalServerErrorException('Failed to get Cashfree order');
    }
  }

  verifyWebhookSignature(rawBody: string, timestamp: string | undefined, signature: string | undefined): void {
    if (!signature || !timestamp) {
      throw new BadRequestException('Missing Cashfree webhook signature or timestamp');
    }

    const clientSecret = this.secretKey;
    if (!clientSecret) {
      throw new InternalServerErrorException('Cashfree secret key is not configured.');
    }

    const signedPayload = timestamp + rawBody;
    const generatedSignature = createHmac('sha256', clientSecret)
      .update(signedPayload)
      .digest('base64');

    if (generatedSignature !== signature) {
      throw new BadRequestException('Invalid Cashfree webhook signature');
    }
  }
}
