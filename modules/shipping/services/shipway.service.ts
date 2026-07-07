import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  IShipwayCancelPayload,
  IShipwayCancelResponse,
  IShipwayCarriersResponse,
  IShipwayNdrActionPayload,
  IShipwayNdrResponse,
  IShipwayPushOrderPayload,
  IShipwayPushOrderResponse,
  IShipwayTrackingResponse,
  IShipwayWebhookEvent,
} from '../interfaces/shipway-api.interface';

@Injectable()
export class ShipwayService {
  private readonly logger = new Logger(ShipwayService.name);
  private readonly email: string;
  private readonly licenseKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.email = this.configService.get<string>('shipway.email') ?? '';
    this.licenseKey = this.configService.get<string>('shipway.licenseKey') ?? '';
    this.baseUrl = (this.configService.get<string>('shipway.baseUrl') ?? 'https://app.shipway.com').replace(/\/+$/, '');
    this.timeoutMs = this.configService.get<number>('shipway.timeoutMs') ?? 15000;
    this.webhookSecret = this.configService.get<string>('shipway.webhookSecret') ?? '';
  }

  pushOrder(payload: IShipwayPushOrderPayload): Promise<IShipwayPushOrderResponse> {
    return this.request<IShipwayPushOrderResponse>('/api/v2orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  getShipmentDetails(orderId: string): Promise<IShipwayTrackingResponse> {
    return this.request<IShipwayTrackingResponse>(
      `/api/getOrderShipmentDetails?order_id=${encodeURIComponent(orderId)}`,
      { method: 'GET' },
    );
  }

  cancelShipment(payload: IShipwayCancelPayload): Promise<IShipwayCancelResponse> {
    return this.request<IShipwayCancelResponse>('/api/cancel', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  getCarriers(): Promise<IShipwayCarriersResponse> {
    return this.request<IShipwayCarriersResponse>('/api/carriers', { method: 'GET' });
  }

  resolveNdr(payload: IShipwayNdrActionPayload): Promise<IShipwayNdrResponse> {
    return this.request<IShipwayNdrResponse>('/api/ndr/action', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    if (!this.email || !this.licenseKey) {
      throw new ServiceUnavailableException('Shipway credentials are not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
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
      type ShipwayApiBody<U> = U & { message?: string; success?: boolean };
      const data: ShipwayApiBody<T> = text ? JSON.parse(text) : {};

      if (!response.ok) {
        const message = data.message ?? `Shipway request failed with HTTP ${response.status}`;
        this.logger.warn({ path, status: response.status, message }, 'Shipway API request failed');
        throw new ServiceUnavailableException(message);
      }

      return data;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Shipway API request failed: ${message}`);
      throw new ServiceUnavailableException('Shipway API is unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }

  verifyWebhookSignature(rawBody: string, signature?: string): void {
    if (!this.webhookSecret) {
      return;
    }

    if (!signature) {
      throw new BadRequestException('Missing Shipway webhook signature');
    }

    const expectedDigest = createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    const signatureBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedDigest, 'utf8');

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      throw new BadRequestException('Invalid Shipway webhook signature');
    }
  }

  private buildAuthHeader(): string {
    return `Basic ${Buffer.from(`${this.email}:${this.licenseKey}`).toString('base64')}`;
  }
}
