import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { describeCashfreeEnv } from '../utils/payment-credential-log.util';

@Injectable()
export class CashfreePaymentService {
  private readonly logger = new Logger(CashfreePaymentService.name);
  private readonly appId: string;
  private readonly secretKey: string;
  private readonly envRaw: string;
  private readonly env: string;
  private readonly apiVersion: string;
  private readonly webhookSecret: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.appId = this.configService.get<string>('CASHFREE_APP_ID')?.trim() ?? '';
    this.secretKey = this.configService.get<string>('CASHFREE_SECRET_KEY')?.trim() ?? '';
    this.envRaw = this.configService.get<string>('CASHFREE_ENV') ?? 'sandbox';
    this.env = this.envRaw.toLowerCase();
    this.apiVersion = this.configService.get<string>('CASHFREE_API_VERSION') ?? '2023-08-01';
    this.webhookSecret = this.configService.get<string>('CASHFREE_WEBHOOK_SECRET')?.trim() ?? '';

    this.baseUrl =
      this.env === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';

    this.logger.log(
      this.getCredentialDiagnostics(),
      '[CASHFREE] Service initialized with env credentials',
    );

    if (!this.appId || !this.secretKey) {
      this.logger.warn(
        this.getCredentialDiagnostics(),
        '[CASHFREE] CASHFREE_APP_ID or CASHFREE_SECRET_KEY is missing. Cashfree integration will be inactive.',
      );
    }
  }

  getAppId(): string {
    return this.appId;
  }

  getEnv(): string {
    return this.env;
  }

  getCredentialDiagnostics() {
    return describeCashfreeEnv({
      appId: this.appId,
      secretKey: this.secretKey,
      envRaw: this.envRaw,
      envNormalized: this.env,
      apiVersion: this.apiVersion,
      baseUrl: this.baseUrl,
      webhookSecret: this.webhookSecret,
    });
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
    orderTags?: Record<string, string>;
  }): Promise<Record<string, any>> {
    this.logger.log(
      {
        orderId: payload.orderId,
        amount: payload.amount,
        currency: payload.currency,
        returnUrl: payload.returnUrl,
        customerId: payload.customer.id,
        phoneSuffix: payload.customer.phone?.slice(-4) ?? null,
        credentials: this.getCredentialDiagnostics(),
      },
      '[CASHFREE] createOrder start',
    );

    if (!this.appId || !this.secretKey) {
      this.logger.error(
        this.getCredentialDiagnostics(),
        '[CASHFREE] createOrder aborted — credentials missing',
      );
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
      ...(payload.orderTags && Object.keys(payload.orderTags).length
        ? { order_tags: payload.orderTags }
        : {}),
    };

    const url = `${this.baseUrl}/orders`;

    try {
      this.logger.log(
        {
          url,
          apiVersion: this.apiVersion,
          headers: {
            'x-client-id': this.appId,
            'x-client-secret': '***masked***',
            'x-api-version': this.apiVersion,
          },
          body: {
            order_id: body.order_id,
            order_amount: body.order_amount,
            order_currency: body.order_currency,
            customer_id: body.customer_details.customer_id,
            return_url: body.order_meta.return_url,
          },
        },
        '[CASHFREE] createOrder request',
      );

      const response = await fetch(url, {
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
        this.logger.error(
          {
            status: response.status,
            statusText: response.statusText,
            response: json,
            credentials: this.getCredentialDiagnostics(),
            requestOrderId: payload.orderId,
          },
          '[CASHFREE] createOrder failed — check credentials / env mismatch',
        );
        const cashfreeMessage =
          (typeof json?.message === 'string' && json.message) ||
          (typeof json?.message === 'object' && json.message?.message) ||
          'Failed to create Cashfree order';
        throw new BadRequestException(
          `Cashfree error: ${cashfreeMessage}. Using ${this.env} API (${this.baseUrl}). ` +
            `CASHFREE_ENV=${this.envRaw}, APP_ID=${this.appId}, SECRET=${this.getCredentialDiagnostics().CASHFREE_SECRET_KEY.masked}. ` +
            'Confirm CASHFREE_APP_ID / CASHFREE_SECRET_KEY match this environment.',
        );
      }

      this.logger.log(
        {
          orderId: payload.orderId,
          cfOrderId: json?.cf_order_id ?? null,
          hasPaymentSessionId: !!json?.payment_session_id,
          orderStatus: json?.order_status ?? null,
          env: this.env,
        },
        '[CASHFREE] createOrder success',
      );

      return json;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        {
          orderId: payload.orderId,
          credentials: this.getCredentialDiagnostics(),
          error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
        },
        '[CASHFREE] createOrder unexpected failure',
      );
      throw new InternalServerErrorException('Failed to create Cashfree order');
    }
  }

  async getOrder(merchantOrderId: string): Promise<Record<string, any>> {
    this.logger.log(
      { merchantOrderId, credentials: this.getCredentialDiagnostics() },
      '[CASHFREE] getOrder start',
    );

    if (!this.appId || !this.secretKey) {
      this.logger.error(
        this.getCredentialDiagnostics(),
        '[CASHFREE] getOrder aborted — credentials missing',
      );
      throw new InternalServerErrorException('Cashfree is not configured properly.');
    }

    try {
      const response = await fetch(`${this.baseUrl}/orders/${merchantOrderId}`, {
        method: 'GET',
        headers: {
          'x-client-id': this.appId,
          'x-client-secret': this.secretKey,
          'x-api-version': this.apiVersion,
        },
      });

      const json = await response.json();
      if (!response.ok) {
        this.logger.error(
          {
            merchantOrderId,
            status: response.status,
            response: json,
            credentials: this.getCredentialDiagnostics(),
          },
          '[CASHFREE] getOrder failed',
        );
        throw new BadRequestException(json.message || 'Failed to fetch Cashfree order status');
      }

      this.logger.log(
        { merchantOrderId, orderStatus: json?.order_status ?? null },
        '[CASHFREE] getOrder success',
      );
      return json;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        {
          merchantOrderId,
          credentials: this.getCredentialDiagnostics(),
          error: error instanceof Error ? error.message : String(error),
        },
        '[CASHFREE] getOrder unexpected failure',
      );
      throw new InternalServerErrorException('Failed to get Cashfree order');
    }
  }

  verifyWebhookSignature(rawBody: string, timestamp: string | undefined, signature: string | undefined): void {
    this.logger.log(
      {
        hasSignature: !!signature,
        hasTimestamp: !!timestamp,
        rawBodyLength: rawBody?.length ?? 0,
        credentials: this.getCredentialDiagnostics(),
      },
      '[CASHFREE] verifyWebhookSignature start',
    );

    if (!signature || !timestamp) {
      this.logger.error('[CASHFREE] Missing webhook signature or timestamp');
      throw new BadRequestException('Missing Cashfree webhook signature or timestamp');
    }

    const clientSecret = this.secretKey;
    if (!clientSecret) {
      this.logger.error(
        this.getCredentialDiagnostics(),
        '[CASHFREE] Webhook verify aborted — secret key missing',
      );
      throw new InternalServerErrorException('Cashfree secret key is not configured.');
    }

    const signedPayload = timestamp + rawBody;
    const generatedSignature = createHmac('sha256', clientSecret)
      .update(signedPayload)
      .digest('base64');

    if (generatedSignature !== signature) {
      this.logger.error(
        {
          timestamp,
          credentials: this.getCredentialDiagnostics(),
          receivedSignatureSuffix: signature.slice(-8),
          generatedSignatureSuffix: generatedSignature.slice(-8),
        },
        '[CASHFREE] Invalid webhook signature',
      );
      throw new BadRequestException('Invalid Cashfree webhook signature');
    }

    this.logger.log('[CASHFREE] Webhook signature verified');
  }
}
