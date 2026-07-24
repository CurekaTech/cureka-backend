import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { RawResponse } from '@packages/common';
import { GokwikGetCartDto } from '../dto/gokwik-get-cart.dto';
import {
  GokwikDiscountDto,
  GokwikSetShippingAddressDto,
} from '../dto/gokwik-cart-actions.dto';
import { GokwikCallbackGuard } from '../guards/gokwik-callback.guard';
import { GokwikCartOwnerGuard } from '../guards/gokwik-cart-owner.guard';
import { GokwikGetCartSuccessResponse } from '../interfaces/gokwik-cart.interface';
import { GokwikCartService } from '../services/gokwik-cart.service';

/**
 * Merchant cart callbacks.
 * Auth:
 * 1. `x-gokwik-callback-secret` — GoKwik → Cureka shared secret
 * 2. `Authorization: Bearer <token>` (or `user_session` cookie) — Cureka user session
 * 3. Cart must belong to that authenticated user
 */
@Controller('gokwik')
@UseGuards(
  GokwikCallbackGuard,
  SessionCookieGuard,
  VerifiedUserGuard,
  GokwikCartOwnerGuard,
)
export class GokwikCartController {
  constructor(private readonly gokwikCartService: GokwikCartService) {}

  @Post('get-cart')
  @RawResponse()
  getCart(@Body() dto: GokwikGetCartDto): Promise<GokwikGetCartSuccessResponse> {
    return this.gokwikCartService.getCart(dto.cart_id);
  }

  @Post('remove-out-of-stock-items')
  @RawResponse()
  removeOutOfStockItems(@Body() dto: GokwikGetCartDto): Promise<GokwikGetCartSuccessResponse> {
    return this.gokwikCartService.removeOutOfStockItems(dto.cart_id);
  }

  @Post('set-shipping-address')
  @RawResponse()
  setShippingAddress(
    @Body() dto: GokwikSetShippingAddressDto,
  ): Promise<GokwikGetCartSuccessResponse> {
    return this.gokwikCartService.setShippingAddress(dto);
  }

  @Post('get-all-discount')
  @RawResponse()
  getAllDiscount(@Body() dto: GokwikGetCartDto) {
    return this.gokwikCartService.getAvailableCoupons(dto.cart_id);
  }

  @Post('apply-discount')
  @RawResponse()
  applyDiscount(@Body() dto: GokwikDiscountDto): Promise<GokwikGetCartSuccessResponse> {
    return this.gokwikCartService.applyDiscount(dto);
  }

  @Post('remove-discount')
  @RawResponse()
  removeDiscount(@Body() dto: GokwikDiscountDto): Promise<GokwikGetCartSuccessResponse> {
    return this.gokwikCartService.removeDiscount(dto);
  }
}
