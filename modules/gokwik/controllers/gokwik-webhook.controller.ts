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
        path: '/api/v1/gokwik/webhooks/transaction',
        event: dto.event,
        paymentId: dto.data?.paymentId,
        amount: dto.data?.amount,
        currency: dto.data?.currency,
        merchantId: dto.data?.merchantId,
        merchantReferenceId: dto.data?.merchantReferenceId,
        method: dto.data?.method,
        provider: dto.data?.provider,
      },
      '[GoKwik-Webhook] transaction hit',
    );
    const result = await this.webhookService.receiveTransaction(dto);
    this.logger.log(
      {
        requestId: req.id,
        event: dto.event,
        paymentId: dto.data?.paymentId,
        ...result,
      },
      '[GoKwik-Webhook] transaction accepted',
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
        path: '/api/v1/gokwik/webhooks/refund',
        event: dto.event,
        refundId: dto.data?.refundId,
        paymentId: dto.data?.paymentId,
        amount: dto.data?.amount,
        auto: dto.data?.auto,
        merchantId: dto.data?.merchantId,
        merchantReferenceId: dto.data?.merchantReferenceId,
        provider: dto.data?.provider,
      },
      '[GoKwik-Webhook] refund hit',
    );
    const result = await this.webhookService.receiveRefund(dto);
    this.logger.log(
      {
        requestId: req.id,
        event: dto.event,
        refundId: dto.data?.refundId,
        ...result,
      },
      '[GoKwik-Webhook] refund accepted',
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
    const carts = dto.carts ?? [];
    this.logger.log(
      {
        requestId: req.id,
        path: '/api/v1/gokwik/webhooks/abandoned-carts',
        request_id: dto.request_id,
        cartCount: carts.length,
        sampleCartIds: carts.slice(0, 5).map((cart) => ({
          cart_id: cart.cart_id,
          merchant_cart_id: cart.merchant_cart_id,
        })),
      },
      '[GoKwik-Webhook] abandoned-carts hit',
    );
    const result = await this.webhookService.receiveAbandonedCarts(dto);
    this.logger.log(
      { requestId: req.id, received: result.received },
      '[GoKwik-Webhook] abandoned-carts processed',
    );
    return result;
  }
}
