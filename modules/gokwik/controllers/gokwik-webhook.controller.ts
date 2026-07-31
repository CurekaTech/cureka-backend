import { Body, Controller, HttpCode, HttpStatus, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { RawResponse } from '@packages/common';
import { FastifyRequest } from 'fastify';
import {
  GokwikAbandonedCartWebhookDto,
  GokwikRefundWebhookDto,
  GokwikTransactionWebhookDto,
} from '../dto/gokwik-webhook.dto';
import { GokwikCallbackGuard } from '../guards/gokwik-callback.guard';
import { GokwikWebhookGuard } from '../guards/gokwik-webhook.guard';
import { GokwikWebhookService } from '../services/gokwik-webhook.service';

@Controller('gokwik/webhooks')
@RawResponse()
export class GokwikWebhookController {
  private readonly logger = new Logger(GokwikWebhookController.name);

  constructor(private readonly webhookService: GokwikWebhookService) {}

  @Post('transaction')
  @HttpCode(HttpStatus.OK)
  @UseGuards(GokwikWebhookGuard)
  async transaction(@Req() req: FastifyRequest, @Body() dto: GokwikTransactionWebhookDto) {
    this.logger.log(
      {
        requestId: req.id,
        event: dto.event,
        paymentId: dto.data?.paymentId,
      },
      'GoKwik transaction webhook received',
    );
    const result = await this.webhookService.receiveTransaction(dto);
    this.logger.log(
      { requestId: req.id, event: dto.event, result },
      'GoKwik transaction webhook accepted',
    );
    return result;
  }

  @Post('refund')
  @HttpCode(HttpStatus.OK)
  @UseGuards(GokwikWebhookGuard)
  async refund(@Req() req: FastifyRequest, @Body() dto: GokwikRefundWebhookDto) {
    this.logger.log(
      {
        requestId: req.id,
        event: dto.event,
        refundId: dto.data?.refundId,
      },
      'GoKwik refund webhook received',
    );
    const result = await this.webhookService.receiveRefund(dto);
    this.logger.log(
      { requestId: req.id, event: dto.event, result },
      'GoKwik refund webhook accepted',
    );
    return result;
  }

  @Post('abandoned-carts')
  @HttpCode(HttpStatus.OK)
  @UseGuards(GokwikCallbackGuard)
  async abandonedCarts(
    @Req() req: FastifyRequest,
    @Body() dto: GokwikAbandonedCartWebhookDto,
  ) {
    this.logger.log(
      {
        requestId: req.id,
        cartCount: dto.carts?.length ?? 0,
      },
      'GoKwik abandoned-carts webhook received',
    );
    const result = await this.webhookService.receiveAbandonedCarts(dto);
    this.logger.log(
      { requestId: req.id, received: result.received },
      'GoKwik abandoned-carts webhook processed',
    );
    return result;
  }
}
