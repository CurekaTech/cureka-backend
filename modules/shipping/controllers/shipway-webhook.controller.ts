import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { ShipwayService } from '../services/shipway.service';
import { ShippingService } from '../services/shipping.service';
import { ShipwayWebhookDto, ShipwayWebhookStatusFeedItemDto } from '../dto/shipway-webhook.dto';
import { IShipwayWebhookEvent } from '../interfaces/shipway-api.interface';

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
        contentType: req.headers['content-type'],
        userAgent: req.headers['user-agent'],
        signatureProvided: Boolean(signature),
        payload: this.redactWebhookPayload(payload),
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

    return {
      received: true,
      requestId: req.id,
      ...results,
    };
  }

  private normalizeEvents(payload: ShipwayWebhookDto): IShipwayWebhookEvent[] {
    if (Array.isArray(payload.status_feed)) {
      return payload.status_feed
        .map((item) => this.toEventFromFeedItem(item))
        .filter((event): event is IShipwayWebhookEvent => Boolean(event));
    }

    const status = this.pickStatus(
      payload.current_status,
      payload.status,
      payload.current_status_code,
      payload.status_code,
    );
    if (!payload.order_id?.trim() || !status) {
      return [];
    }

    return [
      {
        event_id: payload.event_id,
        order_id: payload.order_id,
        status,
        awb_number: payload.awb_number ?? payload.awb ?? payload.awb_no,
        courier_name: payload.courier_name,
        courier_id: payload.courier_id,
        status_date: payload.status_date ?? payload.time,
        location: payload.location,
        message: payload.message,
        tracking_url: payload.tracking_url,
        label_url: payload.label_url,
        invoice_url: payload.invoice_url,
        pickup_id: payload.pickup_id,
        shipment_id: payload.shipment_id,
        status_code: payload.status_code,
        current_status_code: payload.current_status_code ?? payload.status_code,
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
      awb_number: item.awb_number ?? item.awb ?? item.awb_no,
      courier_name: item.courier_name,
      courier_id: item.courier_id,
      status_date: item.status_date ?? item.time,
      location: item.location,
      message: item.message,
    };
  }

  private pickStatus(...candidates: Array<string | undefined>): string | undefined {
    return candidates.map((value) => value?.trim()).find((value) => Boolean(value));
  }

  /** Log payload for beta verification without dumping the auth hash. */
  private redactWebhookPayload(payload: ShipwayWebhookDto): Record<string, unknown> {
    return {
      hashPresent: Boolean(payload.hash),
      statusFeedCount: Array.isArray(payload.status_feed) ? payload.status_feed.length : null,
      status_feed: payload.status_feed?.map((item) => ({
        order_id: item.order_id,
        current_status: item.current_status ?? null,
        status: item.status ?? null,
        current_status_code: item.current_status_code ?? null,
        awb: item.awb ?? item.awb_number ?? item.awb_no ?? null,
        courier_name: item.courier_name ?? null,
        status_date: item.status_date ?? item.time ?? null,
      })),
      order_id: payload.order_id ?? null,
      current_status: payload.current_status ?? null,
      status: payload.status ?? null,
      current_status_code: payload.current_status_code ?? null,
      awb: payload.awb ?? payload.awb_number ?? payload.awb_no ?? null,
      keys: Object.keys(payload),
    };
  }
}
