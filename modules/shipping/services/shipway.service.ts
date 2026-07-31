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
      '[Shipway] Service configured',
    );
  }

  pushOrder(payload: IShipwayPushOrderPayload): Promise<IShipwayPushOrderResponse> {
    return this.request<IShipwayPushOrderResponse>('/api/v2orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getShipmentDetails(orderId: string): Promise<IShipwayTrackingResponse> {
    const startedAt = Date.now();
    this.logger.log(
      {
        shipwayOrderId: orderId,
        baseUrl: this.baseUrl,
        method: 'POST',
        endpoint: '/api/getOrderShipmentDetails',
        authMode: 'json_body_username_password_plus_basic_header',
        requestBody: {
          username: this.email ? '<configured>' : '<missing>',
          password: this.licenseKey ? '<redacted>' : '<missing>',
          order_id: orderId,
        },
        emailConfigured: Boolean(this.email),
        licenseKeyConfigured: Boolean(this.licenseKey),
        timeoutMs: this.timeoutMs,
      },
      '[Shipway] getShipmentDetails — connecting (POST JSON body)',
    );

    // Shipway classic tracking API: POST JSON body (not GET query params).
    const raw = await this.request<IShipwayTrackingResponse>('/api/getOrderShipmentDetails', {
      method: 'POST',
      body: JSON.stringify({
        username: this.email,
        password: this.licenseKey,
        order_id: orderId,
      }),
    });

    this.logger.log(
      {
        shipwayOrderId: orderId,
        elapsedMs: Date.now() - startedAt,
        rawEnvelopeStatus: raw.status ?? null,
        rawSuccess: raw.success ?? null,
        rawMessage: raw.message ?? null,
        hasNestedResponse: Boolean(raw.response),
        rawCurrentStatus: raw.current_status ?? raw.response?.current_status ?? null,
        rawCurrentStatusCode: raw.current_status_code ?? raw.response?.current_status_code ?? null,
        rawAwb: raw.awb_number ?? raw.response?.awb_number ?? null,
        rawCourier: raw.courier_name ?? raw.response?.courier_name ?? null,
        rawScanCount: (
          raw.events ??
          raw.scans ??
          raw.scan ??
          raw.response?.events ??
          raw.response?.scans ??
          raw.response?.scan ??
          []
        ).length,
        rawBody: raw,
      },
      '[Shipway] getShipmentDetails — raw API body',
    );

    const tracking = this.normalizeTrackingResponse(raw, orderId);
    const eventCount = (tracking.events ?? tracking.scans ?? []).length;

    this.logger.log(
      {
        shipwayOrderId: orderId,
        elapsedMs: Date.now() - startedAt,
        success: tracking.success,
        message: tracking.message ?? null,
        current_status: tracking.current_status ?? null,
        current_status_code: tracking.current_status_code ?? null,
        status: tracking.status ?? null,
        awb_number: tracking.awb_number ?? null,
        courier_name: tracking.courier_name ?? null,
        courier_id: tracking.courier_id ?? null,
        shipment_id: tracking.shipment_id ?? null,
        pickup_id: tracking.pickup_id ?? null,
        tracking_url: tracking.tracking_url ?? null,
        label_url: tracking.label_url ?? null,
        invoice_url: tracking.invoice_url ?? null,
        eventCount,
        events: (tracking.events ?? tracking.scans ?? []).map((event) => ({
          status: event.status,
          status_date: event.status_date,
          location: event.location,
          message: event.message,
          activity: event.activity,
        })),
        normalized: tracking,
      },
      '[Shipway] getShipmentDetails — normalized response',
    );

    if (!tracking.success || !tracking.current_status) {
      this.logger.warn(
        {
          shipwayOrderId: orderId,
          elapsedMs: Date.now() - startedAt,
          success: tracking.success,
          current_status: tracking.current_status ?? null,
          message: tracking.message ?? null,
          rawEnvelopeStatus: raw.status ?? null,
        },
        '[Shipway] getShipmentDetails — no usable shipment status after normalize',
      );
    }

    return tracking;
  }

  /** Flatten classic `{ status, response: {...} }` and scan aliases into our tracking shape. */
  private normalizeTrackingResponse(
    raw: IShipwayTrackingResponse,
    orderId: string,
  ): IShipwayTrackingResponse {
    const nested = raw.response ?? {};
    const scans = raw.events ?? raw.scans ?? raw.scan ?? nested.events ?? nested.scans ?? nested.scan ?? [];
    // Never treat envelope status ("Success"/"Error") as the shipment status.
    const currentStatus = raw.current_status ?? nested.current_status ?? undefined;
    const envelopeOk =
      raw.success === true || String(raw.status ?? '').toLowerCase() === 'success';
    const success = envelopeOk || Boolean(currentStatus);

    const mappedScans = scans.map((scan) => ({
      status: scan.status ?? scan.status_detail ?? '',
      status_date: scan.status_date ?? scan.time ?? '',
      location: scan.location,
      message: scan.message ?? scan.status_detail,
      activity: scan.activity,
    }));

    return {
      ...nested,
      ...raw,
      success,
      message: raw.message,
      order_id: raw.order_id ?? nested.order_id ?? orderId,
      current_status: currentStatus,
      // Keep envelope status separate; shipping.service prefers current_status.
      status: currentStatus ?? (envelopeOk ? undefined : raw.status),
      awb_number: raw.awb_number ?? nested.awb_number,
      courier_name: raw.courier_name ?? nested.courier_name,
      courier_id: raw.courier_id ?? nested.courier_id,
      tracking_url: raw.tracking_url ?? nested.tracking_url,
      label_url: raw.label_url ?? nested.label_url,
      invoice_url: raw.invoice_url ?? nested.invoice_url,
      shipment_id: raw.shipment_id ?? nested.shipment_id,
      pickup_id: raw.pickup_id ?? nested.pickup_id,
      current_status_code: raw.current_status_code ?? nested.current_status_code,
      scans: mappedScans,
      events: mappedScans,
      response: undefined,
    };
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
      this.logger.error(
        {
          path,
          method: init.method ?? 'GET',
          emailConfigured: Boolean(this.email),
          licenseKeyConfigured: Boolean(this.licenseKey),
        },
        '[Shipway] Credentials missing — cannot call API',
      );
      throw new ServiceUnavailableException('Shipway credentials are not configured');
    }

    this.assertApiBaseUrl();
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    const method = init.method ?? 'GET';
    const requestBody = init.body ? this.parseRequestBodyForLog(init.body) : undefined;

    this.logger.log(
      {
        path,
        method,
        url,
        timeoutMs: this.timeoutMs,
        body: requestBody,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: 'Basic <redacted>',
        },
      },
      '[Shipway] API request',
    );

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
      const elapsedMs = Date.now() - startedAt;
      const contentType = response.headers.get('content-type') ?? '';
      const looksLikeHtml =
        typeof text === 'string' &&
        (contentType.includes('text/html') || /^\s*<(!doctype|html)/i.test(text));

      this.logger.log(
        {
          path,
          method,
          url,
          elapsedMs,
          httpStatus: response.status,
          statusText: response.statusText,
          ok: response.ok,
          contentType,
          looksLikeHtml,
          bodyPreview: typeof text === 'string' ? text.slice(0, 500) : text,
          body: looksLikeHtml ? { rawBody: '<html truncated — wrong host/path?>' } : data,
          headers: responseHeaders,
        },
        '[Shipway] API response',
      );

      if (!response.ok) {
        const message = this.extractShipwayErrorMessage(data, response.status);
        this.logger.warn(
          {
            path,
            method,
            url,
            elapsedMs,
            httpStatus: response.status,
            contentType,
            looksLikeHtml,
            body: looksLikeHtml ? { rawBody: text.slice(0, 300) } : data,
            message,
          },
          '[Shipway] API request failed (HTTP error)',
        );
        throw new ServiceUnavailableException(message);
      }

      // Classic Shipway APIs often return HTTP 200 with status: "Error".
      if (
        data &&
        typeof data === 'object' &&
        String((data as { status?: string }).status ?? '').toLowerCase() === 'error'
      ) {
        this.logger.warn(
          {
            path,
            method,
            url,
            elapsedMs,
            httpStatus: response.status,
            envelopeStatus: (data as { status?: string }).status,
            message: (data as { message?: string }).message ?? null,
            body: data,
          },
          '[Shipway] API returned HTTP 200 with envelope status=Error',
        );
      }

      return data;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      const isAbort = error instanceof Error && error.name === 'AbortError';
      this.logger.error(
        {
          path,
          method,
          url,
          elapsedMs: Date.now() - startedAt,
          timedOut: isAbort,
          timeoutMs: this.timeoutMs,
          error: error instanceof Error ? { name: error.name, message, stack: error.stack } : { message },
        },
        isAbort ? '[Shipway] API request timed out' : '[Shipway] API request failed with exception',
      );
      throw new ServiceUnavailableException(
        isAbort ? `Shipway request timed out after ${this.timeoutMs}ms` : 'Shipway API is unavailable',
      );
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
      const parsed = JSON.parse(body) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        if ('password' in parsed) parsed.password = '<redacted>';
        if ('license_key' in parsed) parsed.license_key = '<redacted>';
        if ('username' in parsed && typeof parsed.username === 'string') {
          parsed.username = this.maskEmail(parsed.username);
        }
      }
      return parsed;
    } catch {
      return body;
    }
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!local || !domain) return '<configured>';
    const visible = local.slice(0, 2);
    return `${visible}***@${domain}`;
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
