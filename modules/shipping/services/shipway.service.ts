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
    this.baseUrl = this.normalizeBaseUrl(this.configService.get<string>('shipway.baseUrl') ?? 'https://app.shipway.com');
    this.timeoutMs = this.configService.get<number>('shipway.timeoutMs') ?? 15000;
    this.webhookSecret = this.configService.get<string>('shipway.webhookSecret') ?? '';

    this.logger.log(
      {
        baseUrl: this.baseUrl,
        timeoutMs: this.timeoutMs,
        emailConfigured: Boolean(this.email),
        licenseKeyConfigured: Boolean(this.licenseKey),
        webhookSecretConfigured: Boolean(this.webhookSecret),
      },
      'Shipway service configured',
    );
  }

  pushOrder(payload: IShipwayPushOrderPayload): Promise<IShipwayPushOrderResponse> {
    return this.request<IShipwayPushOrderResponse>('/api/v2orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getShipmentDetails(orderId: string): Promise<IShipwayTrackingResponse> {
    this.logger.log(
      {
        shipwayOrderId: orderId,
        baseUrl: this.baseUrl,
        emailConfigured: Boolean(this.email),
        licenseKeyConfigured: Boolean(this.licenseKey),
        timeoutMs: this.timeoutMs,
      },
      '[Shipway] getShipmentDetails — connecting',
    );

    const tracking = await this.request<IShipwayTrackingResponse>(
      `/api/getOrderShipmentDetails?order_id=${encodeURIComponent(orderId)}`,
      { method: 'GET' },
    );

    this.logger.log(
      {
        shipwayOrderId: orderId,
        success: tracking.success,
        message: tracking.message,
        current_status: tracking.current_status,
        status: tracking.status,
        awb_number: tracking.awb_number,
        courier_name: tracking.courier_name,
        shipment_id: tracking.shipment_id,
        tracking_url: tracking.tracking_url,
        eventCount: (tracking.events ?? tracking.scans ?? []).length,
      },
      '[Shipway] getShipmentDetails — response summary',
    );

    return tracking;
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

    this.assertApiBaseUrl();
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const requestLog = {
      path,
      method: init.method ?? 'GET',
      body: init.body ? this.parseRequestBodyForLog(init.body) : undefined,
      url,
      timeoutMs: this.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Basic <redacted>',
      },
    };
    this.logger.log(requestLog, 'Shipway API request');

    try {
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
      type ShipwayApiBody<U> = U & { message?: string; error?: string; status?: string; success?: boolean };
      const data = this.parseResponseBody<T>(text) as ShipwayApiBody<T>;
      const responseHeaders = Object.fromEntries(response.headers.entries());

      const responseLog = {
        path,
        url,
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: responseHeaders,
        body: data,
      };
      this.logger.log(responseLog, 'Shipway API response');

      if (!response.ok) {
        const message = this.extractShipwayErrorMessage(data, response.status);
        this.logger.warn({ path, url, status: response.status, responseHeaders, body: data, message }, 'Shipway API request failed');
        throw new ServiceUnavailableException(message);
      }

      return data;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        {
          path,
          url,
          error: error instanceof Error ? { name: error.name, message, stack: error.stack } : { message },
        },
        'Shipway API request failed with exception',
      );
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

  private normalizeBaseUrl(rawBaseUrl: string): string {
    const trimmed = rawBaseUrl.trim().replace(/\/+$/, '') || 'https://app.shipway.com';
    try {
      const url = new URL(trimmed);
      if (url.pathname === '/api') {
        url.pathname = '';
      }
      return url.toString().replace(/\/+$/, '');
    } catch {
      return trimmed;
    }
  }

  private assertApiBaseUrl(): void {
    try {
      const url = new URL(this.baseUrl);
      if (/webhook|shipments\/webhook/i.test(url.pathname)) {
        throw new ServiceUnavailableException(
          'SHIPWAY_BASE_URL must be the Shipway API host, not the webhook endpoint',
        );
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException('SHIPWAY_BASE_URL is not a valid URL');
    }
  }

  private parseRequestBodyForLog(body: BodyInit): unknown {
    if (typeof body !== 'string') return body;

    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }

  private parseResponseBody<T>(text: string): T | { rawBody?: string } {
    if (!text) return {} as T;

    try {
      return JSON.parse(text) as T;
    } catch {
      return { rawBody: text };
    }
  }

  private extractShipwayErrorMessage(data: { message?: string; error?: string; status?: string }, status: number): string {
    return data.message ?? data.error ?? data.status ?? `Shipway request failed with HTTP ${status}`;
  }
}
