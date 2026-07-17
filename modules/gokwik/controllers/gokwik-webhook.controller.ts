import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { RawResponse } from '@packages/common';
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
  constructor(private readonly webhookService: GokwikWebhookService) {}

  @Post('transaction')
  @UseGuards(GokwikWebhookGuard)
  transaction(@Body() dto: GokwikTransactionWebhookDto) {
    return this.webhookService.receiveTransaction(dto);
  }

  @Post('refund')
  @UseGuards(GokwikWebhookGuard)
  refund(@Body() dto: GokwikRefundWebhookDto) {
    return this.webhookService.receiveRefund(dto);
  }

  @Post('abandoned-carts')
  @UseGuards(GokwikCallbackGuard)
  abandonedCarts(@Body() dto: GokwikAbandonedCartWebhookDto) {
    return this.webhookService.receiveAbandonedCarts(dto);
  }
}
