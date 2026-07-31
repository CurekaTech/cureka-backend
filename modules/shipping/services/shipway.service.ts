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
  /** Classic tracking host — getOrderShipmentDetails lives here (docs: shipway.in). */
  private readonly trackingBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.email = this.configService.get<string>('shipway.email') ?? '';
    this.licenseKey = this.configService.get<string>('shipway.licenseKey') ?? '';
    this.baseUrl = this.normalizeBaseUrl(this.configService.get<string>('shipway.baseUrl') ?? 'https://app.shipway.com');
    this.trackingBaseUrl = this.normalizeBaseUrl(
      this.configService.get<string>('shipway.trackingBaseUrl') ?? 'https://shipway.in',
    );
    this.timeoutMs = this.configService.get<number>('shipway.timeoutMs') ?? 15000;
    this.webhookSecret = this.configService.get<string>('shipway.webhookSecret') ?? '';

    this.logger.log(
      {
        baseUrl: this.baseUrl,
        trackingBaseUrl: this.trackingBaseUrl,
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

  /**
   * Resolve live tracking for a merchant order id.
   * 1) Classic POST shipway.in/api/getOrderShipmentDetails
   * 2) OMS GET app.shipway.com/api/getorders?orderid=
   * 3) OMS GET app.shipway.com/api/tracking?awb_numbers= (when AWB known)
   */
  async getShipmentDetails(
    orderId: string,
    options?: { awbNumber?: string | null },
  ): Promise<IShipwayTrackingResponse> {
    const startedAt = Date.now();
    const knownAwb = options?.awbNumber?.trim() || null;
    const attempts: Array<{ source: string; ok: boolean; detail?: string }> = [];

    this.logger.log(
      {
        shipwayOrderId: orderId,
        knownAwb,
        omsBaseUrl: this.baseUrl,
        trackingBaseUrl: this.trackingBaseUrl,
        timeoutMs: this.timeoutMs,
      },
      '[Shipway] getShipmentDetails — starting multi-host lookup',
    );

    // 1) Classic order tracking (shipway.in)
    try {
      const classic = await this.fetchClassicOrderShipmentDetails(orderId);
      attempts.push({
        source: 'classic_getOrderShipmentDetails',
        ok: Boolean(classic.current_status),
        detail: classic.current_status ?? classic.message ?? undefined,
      });
      if (classic.current_status) {
        this.logger.log(
          {
            shipwayOrderId: orderId,
            source: 'classic_getOrderShipmentDetails',
            elapsedMs: Date.now() - startedAt,
            current_status: classic.current_status,
            awb_number: classic.awb_number ?? null,
            attempts,
          },
          '[Shipway] getShipmentDetails — resolved via classic API',
        );
        return classic;
      }
      this.logger.warn(
        {
          shipwayOrderId: orderId,
          source: 'classic_getOrderShipmentDetails',
          message: classic.message ?? null,
          success: classic.success,
        },
        '[Shipway] Classic API returned no current_status — trying OMS fallbacks',
      );
    } catch (error) {
      attempts.push({
        source: 'classic_getOrderShipmentDetails',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
      this.logger.warn(
        {
          shipwayOrderId: orderId,
          source: 'classic_getOrderShipmentDetails',
          trackingBaseUrl: this.trackingBaseUrl,
          error: this.serializeError(error),
        },
        '[Shipway] Classic getOrderShipmentDetails failed — trying OMS fallbacks',
      );
    }

    // 2) OMS getorders by orderid
    let awbFromOrders: string | null = null;
    try {
      const fromOrders = await this.fetchOmsOrderByOrderId(orderId);
      attempts.push({
        source: 'oms_getorders',
        ok: Boolean(fromOrders?.current_status),
        detail: fromOrders?.current_status ?? fromOrders?.message ?? undefined,
      });
      if (fromOrders?.awb_number) {
        awbFromOrders = fromOrders.awb_number;
      }
      if (fromOrders?.current_status) {
        this.logger.log(
          {
            shipwayOrderId: orderId,
            source: 'oms_getorders',
            elapsedMs: Date.now() - startedAt,
            current_status: fromOrders.current_status,
            awb_number: fromOrders.awb_number ?? null,
            attempts,
          },
          '[Shipway] getShipmentDetails — resolved via OMS getorders',
        );
        return fromOrders;
      }
    } catch (error) {
      attempts.push({
        source: 'oms_getorders',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
      this.logger.warn(
        {
          shipwayOrderId: orderId,
          source: 'oms_getorders',
          error: this.serializeError(error),
        },
        '[Shipway] OMS getorders failed',
      );
    }

    // 3) OMS tracking by AWB
    const awb = knownAwb ?? awbFromOrders;
    if (awb) {
      try {
        const byAwb = await this.fetchOmsTrackingByAwb(awb);
        attempts.push({
          source: 'oms_tracking_by_awb',
          ok: Boolean(byAwb.current_status),
          detail: byAwb.current_status ?? byAwb.message ?? undefined,
        });
        if (byAwb.current_status) {
          this.logger.log(
            {
              shipwayOrderId: orderId,
              source: 'oms_tracking_by_awb',
              awb,
              elapsedMs: Date.now() - startedAt,
              current_status: byAwb.current_status,
              attempts,
            },
            '[Shipway] getShipmentDetails — resolved via OMS tracking',
          );
          return { ...byAwb, order_id: byAwb.order_id ?? orderId };
        }
      } catch (error) {
        attempts.push({
          source: 'oms_tracking_by_awb',
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
        });
        this.logger.warn(
          {
            shipwayOrderId: orderId,
            source: 'oms_tracking_by_awb',
            awb,
            error: this.serializeError(error),
          },
          '[Shipway] OMS tracking by AWB failed',
        );
      }
    } else {
      attempts.push({
        source: 'oms_tracking_by_awb',
        ok: false,
        detail: 'skipped_no_awb',
      });
      this.logger.log(
        { shipwayOrderId: orderId, knownAwb, awbFromOrders },
        '[Shipway] Skipping OMS /api/tracking — no AWB available',
      );
    }

    this.logger.warn(
      {
        shipwayOrderId: orderId,
        elapsedMs: Date.now() - startedAt,
        attempts,
        shipwayStatus: false,
      },
      '[Shipway] getShipmentDetails — all lookups exhausted, no live status',
    );

    return {
      success: false,
      message: 'No Shipway shipment details found for this order',
      order_id: orderId,
    };
  }

  private async fetchClassicOrderShipmentDetails(orderId: string): Promise<IShipwayTrackingResponse> {
    this.logger.log(
      {
        shipwayOrderId: orderId,
        baseUrl: this.trackingBaseUrl,
        method: 'POST',
        endpoint: '/api/getOrderShipmentDetails',
        authMode: 'json_body_username_password_plus_basic_header',
        requestBody: {
          username: this.email ? this.maskEmail(this.email) : '<missing>',
          password: this.licenseKey ? '<redacted>' : '<missing>',
          order_id: orderId,
        },
      },
      '[Shipway] Classic tracking — connecting',
    );

    const raw = await this.request<IShipwayTrackingResponse>(
      '/api/getOrderShipmentDetails',
      {
        method: 'POST',
        body: JSON.stringify({
          username: this.email,
          password: this.licenseKey,
          order_id: orderId,
        }),
      },
      this.trackingBaseUrl,
    );

    this.logger.log(
      {
        shipwayOrderId: orderId,
        baseUrl: this.trackingBaseUrl,
        rawEnvelopeStatus: raw.status ?? null,
        rawSuccess: raw.success ?? null,
        rawMessage: raw.message ?? null,
        hasNestedResponse: Boolean(raw.response),
        rawCurrentStatus: raw.current_status ?? raw.response?.current_status ?? null,
        rawBody: raw,
      },
      '[Shipway] Classic tracking — raw API body',
    );

    return this.normalizeTrackingResponse(raw, orderId);
  }

  private async fetchOmsOrderByOrderId(orderId: string): Promise<IShipwayTrackingResponse | null> {
    const path = `/api/getorders?orderid=${encodeURIComponent(orderId)}`;
    this.logger.log(
      {
        shipwayOrderId: orderId,
        baseUrl: this.baseUrl,
        method: 'GET',
        endpoint: path,
      },
      '[Shipway] OMS getorders — connecting',
    );

    const raw = await this.request<Record<string, unknown>>(path, { method: 'GET' }, this.baseUrl);
    this.logger.log(
      { shipwayOrderId: orderId, rawBody: raw },
      '[Shipway] OMS getorders — raw API body',
    );

    const orders = this.extractOrdersList(raw);
    const match =
      orders.find((order) => String(order['order_id'] ?? order['orderid'] ?? '') === orderId) ??
      orders[0];

    if (!match) {
      this.logger.warn({ shipwayOrderId: orderId, orderCount: orders.length }, '[Shipway] OMS getorders — no matching order');
      return null;
    }

    const awb = this.firstString(match, ['tracking_number', 'awb_number', 'awb', 'awbNumber']);
    const currentStatus = this.firstString(match, [
      'shipment_status',
      'current_status',
      'new_shipment_status',
      'status',
    ]);
    const courier = this.firstString(match, ['courier_name', 'carrier_name', 'carrier']);
    const trackingUrl = this.firstString(match, ['tracking_url', 'track_url']);

    return {
      success: Boolean(currentStatus),
      order_id: orderId,
      awb_number: awb ?? undefined,
      current_status: currentStatus ?? undefined,
      courier_name: courier ?? undefined,
      tracking_url: trackingUrl ?? undefined,
      message: currentStatus ? undefined : 'OMS order found but no shipment status',
    };
  }

  private async fetchOmsTrackingByAwb(awbNumber: string): Promise<IShipwayTrackingResponse> {
    const path = `/api/tracking?awb_numbers=${encodeURIComponent(awbNumber)}&tracking_history=1`;
    this.logger.log(
      {
        awbNumber,
        baseUrl: this.baseUrl,
        method: 'GET',
        endpoint: path,
      },
      '[Shipway] OMS tracking — connecting',
    );

    const raw = await this.request<Record<string, unknown>>(path, { method: 'GET' }, this.baseUrl);
    this.logger.log({ awbNumber, rawBody: raw }, '[Shipway] OMS tracking — raw API body');

    const shipments = Array.isArray(raw['shipments'])
      ? (raw['shipments'] as Array<Record<string, unknown>>)
      : Array.isArray(raw)
        ? (raw as Array<Record<string, unknown>>)
        : [];
    const first = shipments[0] ?? raw;
    const trackingDetails =
      (first['tracking_details'] as Record<string, unknown> | undefined) ??
      (raw['tracking_details'] as Record<string, unknown> | undefined) ??
      {};
    const shipmentDetails = Array.isArray(trackingDetails['shipment_details'])
      ? (trackingDetails['shipment_details'][0] as Record<string, unknown> | undefined)
      : undefined;

    const currentStatus =
      this.firstString(trackingDetails, ['shipment_status', 'current_status', 'status']) ??
      this.firstString(first, ['shipment_status', 'current_status', 'status', 'error']);

    const activities =
      (trackingDetails['shipment_track_activities'] as Array<Record<string, unknown>> | undefined) ??
      (trackingDetails['tracking_history'] as Array<Record<string, unknown>> | undefined) ??
      [];

    const events = activities.map((event) => ({
      status: String(event['activity'] ?? event['status'] ?? event['status_detail'] ?? ''),
      status_date: [event['date'], event['time']].filter(Boolean).join(' ').trim() || String(event['status_date'] ?? ''),
      location: event['location'] != null ? String(event['location']) : undefined,
      message: event['activity'] != null ? String(event['activity']) : undefined,
      activity: event['activity'] != null ? String(event['activity']) : undefined,
    }));

    const awb =
      this.firstString(first, ['awb', 'awb_number']) ??
      awbNumber;

    return {
      success: Boolean(currentStatus) && !String(first['error'] ?? '').trim(),
      message: this.firstString(first, ['error', 'message']) ?? undefined,
      awb_number: awb ?? undefined,
      current_status: currentStatus && !first['error'] ? currentStatus : undefined,
      courier_name:
        this.firstString(shipmentDetails ?? {}, ['courier_name', 'carrier_name']) ??
        this.firstString(trackingDetails, ['courier_name', 'carrier_name']) ??
        undefined,
      tracking_url: this.firstString(trackingDetails, ['track_url', 'tracking_url']) ?? undefined,
      order_id: this.firstString(shipmentDetails ?? {}, ['order_id']) ?? undefined,
      events,
      scans: events,
    };
  }

  private extractOrdersList(raw: Record<string, unknown>): Array<Record<string, unknown>> {
    if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
    for (const key of ['orders', 'message', 'data', 'response']) {
      const value = raw[key];
      if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
      if (value && typeof value === 'object' && Array.isArray((value as { orders?: unknown }).orders)) {
        return (value as { orders: Array<Record<string, unknown>> }).orders;
      }
    }
    return [];
  }

  private firstString(obj: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const value = obj[key];
      if (value != null && String(value).trim()) return String(value).trim();
    }
    return null;
  }

  private serializeError(error: unknown): { name?: string; message: string } {
    if (error instanceof Error) {
      return { name: error.name, message: error.message };
    }
    return { message: String(error) };
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

  private async request<T>(path: string, init: RequestInit, baseUrlOverride?: string): Promise<T> {
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

    const host = baseUrlOverride ?? this.baseUrl;
    this.assertApiBaseUrl(host);
    const url = `${host}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    const method = init.method ?? 'GET';
    const requestBody = init.body ? this.parseRequestBodyForLog(init.body) : undefined;

    this.logger.log(
      {
        path,
        method,
        host,
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

  private assertApiBaseUrl(host: string = this.baseUrl): void {
    try {
      const url = new URL(host);
      if (/webhook|shipments\/webhook/i.test(url.pathname)) {
        throw new ServiceUnavailableException(
          'Shipway base URL must be an API host, not the webhook endpoint',
        );
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException('Shipway base URL is not a valid URL');
    }
  }

  private extractShipwayErrorMessage(
    data: { message?: string; error?: string; status?: string } | string | null | undefined,
    status: number,
  ): string {
    if (typeof data === 'string' && data.trim()) return data.trim();
    if (data && typeof data === 'object') {
      const fromObject = data.message ?? data.error ?? data.status;
      if (fromObject) return String(fromObject);
    }
    return `Shipway request failed with HTTP ${status}`;
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
}
