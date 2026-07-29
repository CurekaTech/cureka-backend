import { Body, Controller, Logger,Post, UseGuards } from '@nestjs/common';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { RawResponse } from '@packages/common';
import { GokwikCheckOrderExistsDto } from '../dto/gokwik-check-order-exists.dto';
import { GokwikCreateOrderDto } from '../dto/gokwik-create-order.dto';
import { GokwikPlaceOrderDto } from '../dto/gokwik-place-order.dto';
import { GokwikCartOwnerGuard } from '../guards/gokwik-cart-owner.guard';
import {
  GokwikCheckOrderExistsResponse,
  GokwikCreateOrderResponse,
  GokwikPlaceOrderResponse,
} from '../interfaces/gokwik-order.interface';
import { GokwikOrderService } from '../services/gokwik-order.service';

/**
 * Merchant order callbacks.
 * Auth:
 * 1. `Authorization: Bearer <token>` (or `user_session` cookie) — Cureka user session
 * 2. Cart must belong to that authenticated user
 */
@Controller('gokwik')
@UseGuards(SessionCookieGuard, VerifiedUserGuard, GokwikCartOwnerGuard)
export class GokwikOrderController {
  private readonly logger = new Logger(GokwikOrderController.name);

  constructor(private readonly gokwikOrderService: GokwikOrderService) {}

  @Post('create-order')
  @RawResponse()
  async createOrder(@Body() dto: GokwikCreateOrderDto): Promise<GokwikCreateOrderResponse> {
    this.logger.log({ cartId: dto.cart_id }, 'GoKwik create-order callback');
    return this.gokwikOrderService.createOrder(dto);
  }

  @Post('place-order')
  @RawResponse()
  async placeOrder(@Body() dto: GokwikPlaceOrderDto): Promise<GokwikPlaceOrderResponse> {
    this.logger.log(
      { cartId: dto.cart_id, orderId: dto.order_id },
      'GoKwik place-order callback',
    );
    return this.gokwikOrderService.placeOrder(dto);
  }

  @Post('check-order-exists')
  @RawResponse()
  checkOrderExists(
    @Body() dto: GokwikCheckOrderExistsDto,
  ): Promise<GokwikCheckOrderExistsResponse> {
    return this.gokwikOrderService.checkOrderExists(dto);
  }
}
