import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import {
  IShipwayCancelPayload,
  IShipwayCancelResponse,
  IShipwayCarriersResponse,
  IShipwayNdrActionPayload,
  IShipwayNdrResponse,
  IShipwayPushOrderPayload,
  IShipwayPushOrderResponse,
  IShipwayTrackingEvent,
  IShipwayTrackingResponse,
} from '../interfaces/shipway-api.interface';
import { ShipwayWebhookDto } from '../dto/shipway-webhook.dto';

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
    const attempts: Array<{ source: string; ok: boolean; eventCount?: number; detail?: string }> = [];
    let merged: IShipwayTrackingResponse = { order_id: orderId };

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

    try {
      const classic = await this.fetchClassicOrderShipmentDetails(orderId);
      attempts.push({
        source: 'classic_getOrderShipmentDetails',
        ok: Boolean(classic.current_status || this.scanCount(classic)),
        eventCount: this.scanCount(classic),
        detail: classic.current_status ?? classic.current_status_code ?? classic.message ?? undefined,
      });
      merged = this.mergeTracking(merged, classic);
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

    let awbFromOrders: string | null = null;
    let carrierId: string | number | undefined;
    try {
      const fromOrders = await this.fetchOmsOrderByOrderId(orderId);
      attempts.push({
        source: 'oms_getorders',
        ok: Boolean(fromOrders?.current_status),
        eventCount: fromOrders ? this.scanCount(fromOrders) : 0,
        detail: fromOrders?.current_status ?? fromOrders?.message ?? undefined,
      });
      if (fromOrders?.awb_number) {
        awbFromOrders = fromOrders.awb_number;
      }
      if (fromOrders?.courier_id) {
        carrierId = fromOrders.courier_id;
      }
      if (fromOrders) {
        merged = this.mergeTracking(merged, fromOrders);
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

    const awb = knownAwb ?? awbFromOrders ?? merged.awb_number ?? null;
    if (awb) {
      try {
        const byAwb = await this.fetchOmsTrackingByAwb(awb);
        attempts.push({
          source: 'oms_tracking_by_awb',
          ok: Boolean(byAwb.current_status || this.scanCount(byAwb)),
          eventCount: this.scanCount(byAwb),
          detail: byAwb.current_status ?? byAwb.message ?? undefined,
        });
        merged = this.mergeTracking(merged, { ...byAwb, order_id: byAwb.order_id ?? orderId });
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

      if (this.scanCount(merged) === 0) {
        try {
          const classicTrack = await this.fetchClassicTrackByAwb(awb, carrierId ?? merged.courier_id);
          attempts.push({
            source: 'classic_track_by_awb',
            ok: Boolean(classicTrack.current_status || this.scanCount(classicTrack)),
            eventCount: this.scanCount(classicTrack),
            detail: classicTrack.current_status ?? classicTrack.message ?? undefined,
          });
          merged = this.mergeTracking(merged, classicTrack);
        } catch (error) {
          attempts.push({
            source: 'classic_track_by_awb',
            ok: false,
            detail: error instanceof Error ? error.message : String(error),
          });
          this.logger.warn(
            {
              shipwayOrderId: orderId,
              awb,
              error: this.serializeError(error),
            },
            '[Shipway] Classic /api/track failed',
          );
        }
      }
    } else {
      attempts.push({
        source: 'oms_tracking_by_awb',
        ok: false,
        detail: 'skipped_no_awb',
      });
    }

    if (!merged.tracking_url && awb) {
      merged.tracking_url = `https://track.shipway.com/t/${awb}`;
    }

    const hasStatus = Boolean(
      merged.current_status || merged.current_status_code || merged.shipway_status,
    );
    this.logger.log(
      {
        shipwayOrderId: orderId,
        elapsedMs: Date.now() - startedAt,
        attempts,
        hasStatus,
        current_status: merged.current_status ?? null,
        current_status_code: merged.current_status_code ?? null,
        shipway_status: merged.shipway_status ?? null,
        awb_number: merged.awb_number ?? null,
        eventCount: this.scanCount(merged),
      },
      hasStatus
        ? '[Shipway] getShipmentDetails — merged lookup complete'
        : '[Shipway] getShipmentDetails — all lookups exhausted, no live status',
    );

    if (!hasStatus) {
      return {
        success: false,
        message: 'No Shipway shipment details found for this order',
        order_id: orderId,
      };
    }

    return { ...merged, success: true, order_id: orderId };
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
    const statusCode = this.firstString(match, [
      'current_status_code',
      'shipway_status',
      'shipment_status_code',
    ]);
    const courier = this.firstString(match, ['courier_name', 'carrier_name', 'carrier']);
    const courierId = this.firstString(match, ['carrier_id', 'courier_id']);
    const trackingUrl = this.firstString(match, ['tracking_url', 'track_url']);
    const scans = this.extractScanArray(match);

    this.logger.log(
      {
        shipwayOrderId: orderId,
        awb,
        currentStatus,
        statusCode,
        courier,
        courierId,
        scanCount: scans.length,
      },
      '[Shipway] OMS getorders — parsed order row',
    );

    return {
      success: Boolean(currentStatus || statusCode),
      order_id: orderId,
      awb_number: awb ?? undefined,
      current_status: currentStatus ?? undefined,
      current_status_code: statusCode ?? undefined,
      shipway_status: statusCode ?? undefined,
      courier_name: courier ?? undefined,
      courier_id: courierId ?? undefined,
      tracking_url: trackingUrl ?? undefined,
      events: scans,
      scans,
      message: currentStatus || statusCode ? undefined : 'OMS order found but no shipment status',
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

    const activities = this.extractScanArray(trackingDetails)
      .concat(this.extractScanArray(first))
      .concat(this.extractScanArray(raw));
    const statusCode =
      this.firstString(trackingDetails, ['current_status_code', 'shipway_status']) ??
      this.firstString(first, ['current_status_code', 'shipway_status']);

    const awb =
      this.firstString(first, ['awb', 'awb_number']) ??
      awbNumber;

    this.logger.log(
      {
        awbNumber: awb,
        currentStatus,
        statusCode,
        scanCount: activities.length,
        scans: activities.map((event) => ({
          status: event.status,
          location: event.location,
          status_date: event.status_date,
        })),
      },
      '[Shipway] OMS tracking — parsed scan history',
    );

    return {
      success: Boolean(currentStatus || statusCode || activities.length) && !String(first['error'] ?? '').trim(),
      message: this.firstString(first, ['error', 'message']) ?? undefined,
      awb_number: awb ?? undefined,
      current_status: currentStatus && !first['error'] ? currentStatus : undefined,
      current_status_code: statusCode ?? undefined,
      shipway_status: statusCode ?? undefined,
      courier_name:
        this.firstString(shipmentDetails ?? {}, ['courier_name', 'carrier_name']) ??
        this.firstString(trackingDetails, ['courier_name', 'carrier_name']) ??
        undefined,
      tracking_url: this.firstString(trackingDetails, ['track_url', 'tracking_url']) ?? undefined,
      order_id: this.firstString(shipmentDetails ?? {}, ['order_id']) ?? undefined,
      events: activities,
      scans: activities,
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

  private scanCount(tracking?: IShipwayTrackingResponse | null): number {
    if (!tracking) return 0;
    return tracking.events?.length || tracking.scans?.length || tracking.scan?.length || 0;
  }

  private mergeTracking(
    base: IShipwayTrackingResponse,
    extra: IShipwayTrackingResponse,
  ): IShipwayTrackingResponse {
    const extraScans = extra.events ?? extra.scans ?? extra.scan ?? [];
    const baseScans = base.events ?? base.scans ?? base.scan ?? [];
    const scans = extraScans.length > 0 ? extraScans : baseScans;

    return {
      ...base,
      ...extra,
      current_status: extra.current_status || base.current_status,
      current_status_code: extra.current_status_code || base.current_status_code,
      shipway_status: extra.shipway_status || base.shipway_status,
      awb_number: extra.awb_number || base.awb_number,
      courier_name: extra.courier_name || base.courier_name,
      courier_id: extra.courier_id ?? base.courier_id,
      tracking_url: extra.tracking_url || base.tracking_url,
      events: scans,
      scans,
    };
  }

  private extractScanArray(source: unknown): IShipwayTrackingEvent[] {
    if (!source || typeof source !== 'object') return [];

    const obj = source as Record<string, unknown>;
    const buckets: unknown[] = [
      obj['events'],
      obj['scans'],
      obj['scan'],
      obj['tracking_history'],
      obj['shipment_track_activities'],
      obj['track_history'],
    ];

    if (obj['track_result'] && typeof obj['track_result'] === 'object') {
      buckets.push(...this.extractScanArray(obj['track_result']).map((event) => event));
      const nested = obj['track_result'] as Record<string, unknown>;
      buckets.push(nested['scan'], nested['scans'], nested['events']);
    }
    if (obj['response'] && typeof obj['response'] === 'object') {
      buckets.push(
        (obj['response'] as Record<string, unknown>)['scan'],
        (obj['response'] as Record<string, unknown>)['scans'],
        (obj['response'] as Record<string, unknown>)['events'],
      );
    }
    if (obj['tracking_details'] && typeof obj['tracking_details'] === 'object') {
      const details = obj['tracking_details'] as Record<string, unknown>;
      buckets.push(
        details['shipment_track_activities'],
        details['tracking_history'],
        details['scan'],
        details['scans'],
      );
    }

    const rows: IShipwayTrackingEvent[] = [];
    for (const bucket of buckets) {
      if (!Array.isArray(bucket)) continue;
      for (const item of bucket) {
        if (!item || typeof item !== 'object') continue;
        const event = item as Record<string, unknown>;
        const detail = this.firstString(event, ['status_detail', 'details', 'message', 'activity', 'status']);
        const location = this.firstString(event, ['location', 'city', 'hub']);
        const time = this.firstString(event, ['status_date', 'time', 'date', 'datetime', 'created_at']);
        if (!detail && !location && !time) continue;
        rows.push({
          status: detail ?? '',
          status_date: time ?? '',
          location: location ?? undefined,
          message: detail ?? undefined,
          activity: this.firstString(event, ['activity']) ?? undefined,
          status_detail: this.firstString(event, ['status_detail', 'details']) ?? undefined,
        });
      }
    }
    return rows;
  }

  private async fetchClassicTrackByAwb(
    awb: string,
    carrierId?: string | number,
  ): Promise<IShipwayTrackingResponse> {
    this.logger.log(
      {
        awb,
        carrierId: carrierId ?? null,
        baseUrl: this.trackingBaseUrl,
        endpoint: '/api/track',
      },
      '[Shipway] Classic /api/track — connecting',
    );

    const body: Record<string, unknown> = {
      username: this.email,
      password: this.licenseKey,
      awb,
    };
    if (carrierId != null && String(carrierId).trim()) {
      body.carrier_id = carrierId;
    }

    const raw = await this.request<Record<string, unknown>>(
      '/api/track',
      { method: 'POST', body: JSON.stringify(body) },
      this.trackingBaseUrl,
    );

    const trackResult =
      raw['track_result'] && typeof raw['track_result'] === 'object'
        ? (raw['track_result'] as Record<string, unknown>)
        : raw;
    const scans = this.extractScanArray(raw);
    const currentStatus =
      this.firstString(trackResult, ['current_status', 'status']) ??
      this.firstString(raw, ['current_status']);
    const statusCode = this.firstString(trackResult, ['shipway_status', 'current_status_code']);

    this.logger.log(
      {
        awb,
        currentStatus,
        statusCode,
        scanCount: scans.length,
        scans: scans.map((event) => ({
          status: event.status,
          location: event.location,
          status_date: event.status_date,
        })),
        rawBody: raw,
      },
      '[Shipway] Classic /api/track — parsed',
    );

    return {
      success: Boolean(currentStatus || statusCode || scans.length),
      current_status: currentStatus ?? undefined,
      current_status_code: statusCode ?? undefined,
      shipway_status: statusCode ?? undefined,
      awb_number: this.firstString(trackResult, ['awb_no', 'awb_number', 'awb']) ?? awb,
      courier_name: this.firstString(
        (trackResult['couriers'] as Record<string, unknown> | undefined) ?? {},
        ['courier_name', 'name'],
      ) ?? undefined,
      events: scans,
      scans,
    };
  }

  /** Flatten classic `{ status, response: {...} }` and scan aliases into our tracking shape. */
  private normalizeTrackingResponse(
    raw: IShipwayTrackingResponse & { msg?: string },
    orderId: string,
  ): IShipwayTrackingResponse {
    const nested = raw.response ?? {};
    const rawRecord = raw as unknown as Record<string, unknown>;
    const nestedRecord = nested as unknown as Record<string, unknown>;
    const scans = this.extractScanArray(rawRecord);
    const currentStatus =
      raw.current_status ??
      nested.current_status ??
      this.firstString(rawRecord, ['current_status']) ??
      this.firstString(nestedRecord, ['current_status']) ??
      undefined;
    const statusCode =
      raw.current_status_code ??
      nested.current_status_code ??
      raw.shipway_status ??
      nested.shipway_status ??
      this.firstString(rawRecord, ['current_status_code', 'shipway_status']) ??
      this.firstString(nestedRecord, ['current_status_code', 'shipway_status']) ??
      undefined;
    const envelopeStatus = String(raw.status ?? '').toLowerCase();
    const envelopeOk = raw.success === true || envelopeStatus === 'success';
    const success = envelopeOk || Boolean(currentStatus || statusCode);

    const mappedScans = scans.map((scan) => {
      const detail = scan.status_detail ?? scan.details ?? scan.message ?? scan.activity ?? '';
      return {
        status: scan.status || detail,
        status_date: scan.status_date ?? scan.time ?? '',
        location: scan.location,
        message: detail || undefined,
        activity: scan.activity,
        status_detail: scan.status_detail ?? scan.details,
        details: scan.details,
      };
    });

    this.logger.log(
      {
        shipwayOrderId: orderId,
        currentStatus,
        statusCode,
        scanCount: mappedScans.length,
        scans: mappedScans.map((scan) => ({
          status: scan.status,
          location: scan.location,
          status_date: scan.status_date,
        })),
      },
      '[Shipway] Classic tracking — normalized scans',
    );

    return {
      ...nested,
      ...raw,
      success,
      message: raw.message ?? raw.msg,
      order_id: raw.order_id ?? nested.order_id ?? orderId,
      current_status: currentStatus,
      current_status_code: statusCode,
      shipway_status: statusCode,
      status: currentStatus ?? (envelopeOk ? undefined : raw.status),
      awb_number: raw.awb_number ?? nested.awb_number ?? this.firstString(rawRecord, ['awb_number', 'awb', 'awb_no']) ?? this.firstString(nestedRecord, ['awb_number', 'awb', 'awb_no']) ?? undefined,
      courier_name: raw.courier_name ?? nested.courier_name,
      courier_id: raw.courier_id ?? nested.courier_id,
      tracking_url: raw.tracking_url ?? nested.tracking_url,
      label_url: raw.label_url ?? nested.label_url,
      invoice_url: raw.invoice_url ?? nested.invoice_url,
      shipment_id: raw.shipment_id ?? nested.shipment_id,
      pickup_id: raw.pickup_id ?? nested.pickup_id,
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
      const trimmedText = typeof text === 'string' ? text.trim() : '';
      const looksLikeJson =
        trimmedText.startsWith('{') ||
        trimmedText.startsWith('[') ||
        trimmedText.startsWith('"');
      const looksLikeHtml =
        !looksLikeJson &&
        typeof text === 'string' &&
        (contentType.includes('text/html') || /^\s*<(!doctype|html)/i.test(text));

      this.logger.log(
        {
          path,
          method,
          url,
          host,
          elapsedMs,
          httpStatus: response.status,
          statusText: response.statusText,
          ok: response.ok,
          contentType,
          looksLikeHtml,
          bodyPreview: typeof text === 'string' ? text.slice(0, 500) : text,
          body: looksLikeHtml ? { rawBody: text.slice(0, 300) } : data,
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

  /**
   * Authenticate Shipway webhooks.
   * - Classic `status_feed`: body `hash` must equal md5(email:licenseKey)
   * - Single-event: HMAC-SHA256 hex of raw body via `x-webhook-signature` / `x-shipway-signature`
   * Production is fail-closed when the required secret/credentials are missing.
   */
  verifyWebhookAuth(
    payload: ShipwayWebhookDto,
    rawBody: string,
    signature?: string,
  ): void {
    const isProduction = process.env['NODE_ENV'] === 'production';
    const isStatusFeed = Array.isArray(payload.status_feed) && payload.status_feed.length > 0;

    if (isStatusFeed) {
      this.verifyStatusFeedHash(payload.hash, isProduction);
      return;
    }

    this.verifyWebhookSignature(rawBody, signature, isProduction);
  }

  verifyStatusFeedHash(hash?: string, isProduction: boolean = process.env['NODE_ENV'] === 'production'): void {
    if (!this.email || !this.licenseKey) {
      if (isProduction) {
        throw new ServiceUnavailableException(
          'Shipway webhook credentials are not configured (SHIPWAY_EMAIL / SHIPWAY_LICENSE_KEY)',
        );
      }
      this.logger.warn(
        '[Shipway] Skipping status_feed hash verification — credentials not configured (non-production)',
      );
      return;
    }

    if (!hash?.trim()) {
      throw new UnauthorizedException('Missing Shipway webhook hash');
    }

    const expectedDigest = createHash('md5')
      .update(`${this.email}:${this.licenseKey}`)
      .digest('hex');

    if (!this.timingSafeEqualString(hash.trim(), expectedDigest)) {
      throw new UnauthorizedException('Invalid Shipway webhook hash');
    }
  }

  verifyWebhookSignature(
    rawBody: string,
    signature?: string,
    isProduction: boolean = process.env['NODE_ENV'] === 'production',
  ): void {
    if (!this.webhookSecret) {
      if (isProduction) {
        throw new ServiceUnavailableException(
          'Shipway webhook secret is not configured (SHIPWAY_WEBHOOK_SECRET)',
        );
      }
      this.logger.warn(
        '[Shipway] Skipping HMAC signature verification — SHIPWAY_WEBHOOK_SECRET not configured (non-production)',
      );
      return;
    }

    if (!signature?.trim()) {
      throw new UnauthorizedException('Missing Shipway webhook signature');
    }

    const expectedDigest = createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (!this.timingSafeEqualString(signature.trim(), expectedDigest)) {
      throw new UnauthorizedException('Invalid Shipway webhook signature');
    }
  }

  private timingSafeEqualString(provided: string, expectedHex: string): boolean {
    const normalizedProvided = provided.toLowerCase().startsWith('sha256=')
      ? provided.slice('sha256='.length)
      : provided;
    const providedBuffer = Buffer.from(normalizedProvided, 'utf8');
    const expectedBuffer = Buffer.from(expectedHex, 'utf8');
    return (
      providedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(providedBuffer, expectedBuffer)
    );
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
