import { BadRequestException, Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { ShipwayService } from '../services/shipway.service';
import { ShippingService } from '../services/shipping.service';
import { ShipwayWebhookDto } from '../dto/shipway-webhook.dto';
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

    this.shipwayService.verifyWebhookAuth(payload, rawBody, signature);

    const events = this.normalizeEvents(payload);
    if (!events.length) {
      throw new BadRequestException('Shipway webhook contained no status events');
    }

    this.logger.log(
      {
        eventCount: events.length,
        orderIds: events.map((e) => e.order_id),
        format: payload.status_feed?.length ? 'status_feed' : 'single_event',
        signatureProvided: Boolean(signature),
        hashProvided: Boolean(payload.hash),
      },
      'Shipway webhook received',
    );

    const results = await this.shippingService.handleShipwayWebhookBatch(events);

    return {
      received: true,
      requestId: req.id,
      ...results,
    };
  }

  private normalizeEvents(payload: ShipwayWebhookDto): IShipwayWebhookEvent[] {
    if (payload.status_feed?.length) {
      return payload.status_feed.map((item) => ({
        order_id: item.order_id,
        status: item.current_status,
        current_status_code: item.current_status,
      }));
    }

    return [
      {
        event_id: payload.event_id,
        order_id: payload.order_id!,
        status: payload.status!,
        awb_number: payload.awb_number,
        courier_name: payload.courier_name,
        courier_id: payload.courier_id,
        status_date: payload.status_date,
        location: payload.location,
        message: payload.message,
        tracking_url: payload.tracking_url,
        label_url: payload.label_url,
        invoice_url: payload.invoice_url,
        pickup_id: payload.pickup_id,
        shipment_id: payload.shipment_id,
        status_code: payload.status_code,
        current_status_code: payload.current_status_code,
      },
    ];
  }
}
