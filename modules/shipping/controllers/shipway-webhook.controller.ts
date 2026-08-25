import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { ShipwayService } from '../services/shipway.service';
import { ShippingService } from '../services/shipping.service';
import {
  ShipwayWebhookApiInputDto,
  ShipwayWebhookDto,
  ShipwayWebhookStatusFeedItemDto,
} from '../dto/shipway-webhook.dto';
import { IShipwayTrackingEvent, IShipwayWebhookEvent } from '../interfaces/shipway-api.interface';

@ApiExcludeController()
@Controller('shipments')
export class ShipwayWebhookController {
  private readonly logger = new Logger(ShipwayWebhookController.name);

  constructor(
    private readonly shipwayService: ShipwayService,
    private readonly shippingService: ShippingService,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() req: FastifyRequest,
    @Body() payload: ShipwayWebhookDto,
    @Headers('x-webhook-signature') webhookSignature?: string,
    @Headers('x-shipway-signature') shipwaySignature?: string,
  ) {
    const rawBodySource = (req as FastifyRequest & { rawBody?: Buffer | string }).rawBody;
    const rawBody = Buffer.isBuffer(rawBodySource)
      ? rawBodySource.toString('utf8')
      : rawBodySource ?? JSON.stringify(payload);
    const signature = webhookSignature ?? shipwaySignature;

    this.logger.log(
      {
        requestId: req.id,
        endpoint: 'POST /api/v1/shipments/webhook',
        contentType: req.headers['content-type'],
        userAgent: req.headers['user-agent'],
        signatureProvided: Boolean(signature),
        payload: this.redactWebhookPayload(payload),
        next: 'verify auth → map status → update shipments/orders → emit SHIPMENT_UPDATED → BOB fulfillment',
      },
      '[Shipway] Incoming webhook payload',
    );

    this.shipwayService.verifyWebhookAuth(payload, rawBody, signature);

    const events = this.normalizeEvents(payload);
    if (!events.length) {
      this.logger.log(
        { requestId: req.id, reason: 'empty_status_feed_or_sample' },
        '[Shipway] Valid webhook with no status events — acknowledging sample/ping',
      );
      return {
        received: true,
        requestId: req.id,
        processed: 0,
        skipped: 0,
        notFound: 0,
        sample: true,
      };
    }

    const results = await this.shippingService.handleShipwayWebhookBatch(events);

    this.logger.log(
      {
        requestId: req.id,
        endpoint: 'POST /api/v1/shipments/webhook',
        eventCount: events.length,
        ...results,
      },
      '[Shipway] Webhook batch finished',
    );

    return {
      received: true,
      requestId: req.id,
      ...results,
    };
  }

  /**
   * Normalize every supported Shipway body into one or more internal events.
   * Preferred single-event format (panel sample):
   * `{ order_id, current_status, status_time, awbno, carrier, api_input }`
   */
  normalizeEvents(payload: ShipwayWebhookDto): IShipwayWebhookEvent[] {
    if (Array.isArray(payload.status_feed)) {
      return payload.status_feed
        .map((item) => this.toEventFromFeedItem(item))
        .filter((event): event is IShipwayWebhookEvent => Boolean(event));
    }

    const api = payload.api_input;
    const orderId = this.firstString(payload.order_id, api?.order_id);
    const status = this.pickStatus(
      payload.current_status,
      payload.status,
      payload.current_status_code,
      payload.status_code,
      api?.current_status,
    );

    if (!orderId || !status) {
      return [];
    }

    const awb = this.firstString(
      payload.awbno,
      payload.awb_number,
      payload.awb,
      payload.awb_no,
      api?.awbno,
    );
    const courier = this.firstString(payload.carrier, payload.courier_name, api?.carrier);
    const statusDate = this.firstString(
      payload.status_time,
      payload.status_date,
      payload.time,
      payload.scans_current_status_time,
      api?.status_time,
    );
    const trackingUrl = this.firstString(payload.tracking_url, api?.tracking_url);
    const courierId = payload.courier_id ?? api?.carrier_id;
    const message = this.firstString(
      payload.message,
      payload.scans_current_status,
      api?.current_status_desc,
    );
    const scans = this.normalizeScans(api);

    return [
      {
        event_id: payload.event_id,
        order_id: orderId,
        status,
        awb_number: awb,
        courier_name: courier,
        courier_id: courierId,
        status_date: statusDate,
        location: payload.location,
        message,
        tracking_url: trackingUrl,
        label_url: payload.label_url,
        invoice_url: payload.invoice_url,
        pickup_id: payload.pickup_id,
        shipment_id: payload.shipment_id,
        status_code: payload.status_code,
        current_status_code:
          payload.current_status_code ?? payload.status_code ?? (this.isStatusCode(status) ? status : undefined),
        scans,
      },
    ];
  }

  private toEventFromFeedItem(item: ShipwayWebhookStatusFeedItemDto): IShipwayWebhookEvent | null {
    const status = this.pickStatus(item.current_status, item.status, item.current_status_code);
    if (!item.order_id?.trim() || !status) {
      return null;
    }

    return {
      order_id: item.order_id,
      status,
      current_status_code: item.current_status_code ?? item.current_status,
      awb_number: this.firstString(item.awbno, item.awb_number, item.awb, item.awb_no),
      courier_name: this.firstString(item.carrier, item.courier_name),
      courier_id: item.courier_id,
      status_date: this.firstString(item.status_time, item.status_date, item.time),
      location: item.location,
      message: item.message,
    };
  }

  private normalizeScans(api?: ShipwayWebhookApiInputDto): IShipwayTrackingEvent[] | undefined {
    if (!api?.scans) {
      return undefined;
    }

    const rows = Array.isArray(api.scans)
      ? api.scans
      : Object.keys(api.scans)
          .sort((a, b) => Number(a) - Number(b))
          .map((key) => (api.scans as Record<string, unknown>)[key]);

    const scans: IShipwayTrackingEvent[] = [];
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        continue;
      }
      const record = row as Record<string, unknown>;
      const status = this.firstString(
        typeof record['status'] === 'string' ? record['status'] : undefined,
        typeof record['status_detail'] === 'string' ? record['status_detail'] : undefined,
      );
      if (!status) {
        continue;
      }
      scans.push({
        status,
        location: typeof record['location'] === 'string' ? record['location'] : undefined,
        status_date: this.firstString(
          typeof record['time'] === 'string' ? record['time'] : undefined,
          typeof record['status_date'] === 'string' ? record['status_date'] : undefined,
        ),
        message: typeof record['message'] === 'string' ? record['message'] : undefined,
      });
    }

    return scans.length ? scans : undefined;
  }

  private pickStatus(...candidates: Array<string | undefined>): string | undefined {
    return candidates.map((value) => value?.trim()).find((value) => Boolean(value));
  }

  private firstString(...candidates: Array<string | undefined | null>): string | undefined {
    return candidates.map((value) => value?.trim()).find((value) => Boolean(value));
  }

  private isStatusCode(value: string): boolean {
    return /^[A-Z0-9]{1,5}$/i.test(value.trim());
  }

  /** Log payload for beta verification without dumping PII / auth hash. */
  private redactWebhookPayload(payload: ShipwayWebhookDto): Record<string, unknown> {
    return {
      hashPresent: Boolean(payload.hash),
      statusFeedCount: Array.isArray(payload.status_feed) ? payload.status_feed.length : null,
      status_feed: payload.status_feed?.map((item) => ({
        order_id: item.order_id,
        current_status: item.current_status ?? null,
        status: item.status ?? null,
        current_status_code: item.current_status_code ?? null,
        awb: item.awbno ?? item.awb ?? item.awb_number ?? item.awb_no ?? null,
        courier_name: item.carrier ?? item.courier_name ?? null,
        status_date: item.status_time ?? item.status_date ?? item.time ?? null,
      })),
      order_id: payload.order_id ?? payload.api_input?.order_id ?? null,
      current_status: payload.current_status ?? payload.api_input?.current_status ?? null,
      status: payload.status ?? null,
      current_status_code: payload.current_status_code ?? null,
      awb: payload.awbno ?? payload.awb ?? payload.awb_number ?? payload.awb_no ?? null,
      carrier: payload.carrier ?? null,
      status_time: payload.status_time ?? null,
      scans_current_status: payload.scans_current_status ?? null,
      hasApiInput: Boolean(payload.api_input),
      apiInputKeys: payload.api_input ? Object.keys(payload.api_input) : [],
      keys: Object.keys(payload),
    };
  }
}
