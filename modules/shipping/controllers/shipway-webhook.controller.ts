import { BadRequestException, Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { ShipwayService } from '../services/shipway.service';
import { ShippingService } from '../services/shipping.service';
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
    @Body() payload: Record<string, unknown>,
    @Headers('x-webhook-signature') webhookSignature?: string,
    @Headers('x-shipway-signature') shipwaySignature?: string,
  ) {
    const rawBodySource = (req as FastifyRequest & { rawBody?: Buffer | string }).rawBody;
    const rawBody = Buffer.isBuffer(rawBodySource)
      ? rawBodySource.toString('utf8')
      : rawBodySource ?? JSON.stringify(payload);
    const signature = webhookSignature ?? shipwaySignature;
    this.shipwayService.verifyWebhookSignature(rawBody, signature);

    const event = payload as IShipwayWebhookEvent;
    this.logger.log(
      { orderId: event.order_id, status: event.status, eventId: event.event_id, signatureProvided: Boolean(signature) },
      'Shipway webhook received',
    );
    await this.shippingService.handleShipwayWebhook(event);

    return {
      received: true,
      requestId: req.id,
    };
  }
}
