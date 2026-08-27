import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RawResponse } from '@packages/common';
import { FastifyRequest } from 'fastify';
import { BobAbandonedCartWebhookQueryDto } from '../dto/bob-abandoned-cart-webhook.dto';
import { BobWebhookSecretGuard } from '../guards/bob-webhook-secret.guard';
import { BobAbandonedCartWebhookService } from '../services/bob-abandoned-cart-webhook.service';

/**
 * Cureka → BOB abandoned-cart data API (independent of GoKwik).
 * BOB calls this with `x-bob-webhook-secret` matching `BOB_WEBHOOK_SECRET`
 * and receives Cureka user-cart abandoned payloads for WhatsApp recovery.
 */
@ApiTags('BOB / webhooks')
@ApiHeader({ name: 'x-bob-webhook-secret', required: true })
@UseGuards(BobWebhookSecretGuard)
@RawResponse()
@Controller('bob/webhooks')
export class BobWebhooksController {
  private readonly logger = new Logger(BobWebhooksController.name);

  constructor(
    private readonly abandonedCartWebhookService: BobAbandonedCartWebhookService,
  ) {}

  @ApiOperation({
    summary:
      'List Cureka abandoned carts for BOB (user carts). GET /api/v1/bob/webhooks/abandoned-cart',
  })
  @Get('abandoned-cart')
  @HttpCode(HttpStatus.OK)
  async listAbandonedCarts(
    @Req() req: FastifyRequest,
    @Query() query: BobAbandonedCartWebhookQueryDto,
  ) {
    this.logger.log(
      {
        requestId: req.id,
        path: '/api/v1/bob/webhooks/abandoned-cart',
        page: query.page,
        limit: query.limit,
      },
      '[BOB-Webhook] abandoned-cart list hit',
    );
    const result = await this.abandonedCartWebhookService.list(query);
    this.logger.log(
      {
        requestId: req.id,
        returned: result.carts.length,
        total: result.total,
      },
      '[BOB-Webhook] abandoned-cart list served',
    );
    return result;
  }

  @ApiOperation({
    summary: 'One Cureka abandoned cart by cart refId for BOB',
  })
  @Get('abandoned-cart/:refId')
  @HttpCode(HttpStatus.OK)
  async getAbandonedCart(
    @Req() req: FastifyRequest,
    @Param('refId') refId: string,
  ) {
    this.logger.log(
      {
        requestId: req.id,
        path: `/api/v1/bob/webhooks/abandoned-cart/${refId}`,
        refId,
      },
      '[BOB-Webhook] abandoned-cart detail hit',
    );
    return this.abandonedCartWebhookService.getOne(refId);
  }
}
