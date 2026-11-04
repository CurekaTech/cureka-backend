import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, UseGuards } from '@nestjs/common';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { RawResponse } from '@packages/common';
import { GokwikGetCartDto, GokwikGetCartQueryDto } from '../dto/gokwik-get-cart.dto';
import {
  GokwikDiscountDto,
  GokwikSetShippingAddressDto,
} from '../dto/gokwik-cart-actions.dto';
import {
  GokwikCartOwnerGuard,
  GokwikCartOwnerRequest,
} from '../guards/gokwik-cart-owner.guard';
import { GokwikCheckoutAuthGuard } from '../guards/gokwik-checkout-auth.guard';
import { GokwikGetCartSuccessResponse } from '../interfaces/gokwik-cart.interface';
import { GokwikCartService } from '../services/gokwik-cart.service';

/**
 * Merchant cart callbacks.
 * Auth:
 * 1. `Authorization: Bearer <gokwik_checkout>` (preferred) or legacy user session
 * 2. Cart must belong to that authenticated user (and match token cart binding when present)
 */
@Controller('gokwik')
@UseGuards(GokwikCheckoutAuthGuard, VerifiedUserGuard, GokwikCartOwnerGuard)
export class GokwikCartController {
  constructor(private readonly gokwikCartService: GokwikCartService) {}

  @Post('get-cart')
  @HttpCode(HttpStatus.OK)
  @RawResponse()
  getCart(
    @Body() dto: GokwikGetCartDto,
    @Req() request: GokwikCartOwnerRequest,
  ): Promise<GokwikGetCartSuccessResponse> {
    return this.gokwikCartService.getCart(request.gokwikResolvedCartId ?? dto.cart_id ?? '');
  }

  /** GoKwik checkout-red RestClient uses GET against the configured merchant Get Cart URL. */
  @Get('get-cart')
  @HttpCode(HttpStatus.OK)
  @RawResponse()
  getCartViaGet(
    @Query() query: GokwikGetCartQueryDto,
    @Req() request: GokwikCartOwnerRequest,
  ): Promise<GokwikGetCartSuccessResponse> {
    return this.gokwikCartService.getCart(
      request.gokwikResolvedCartId ?? query.cart_id ?? query.cartId ?? '',
    );
  }

  @Post('remove-out-of-stock-items')
  @HttpCode(HttpStatus.OK)
  @RawResponse()
  removeOutOfStockItems(
    @Body() dto: GokwikGetCartDto,
    @Req() request: GokwikCartOwnerRequest,
  ): Promise<GokwikGetCartSuccessResponse> {
    return this.gokwikCartService.removeOutOfStockItems(
      request.gokwikResolvedCartId ?? dto.cart_id ?? '',
    );
  }

  @Post('set-shipping-address')
  @HttpCode(HttpStatus.OK)
  @RawResponse()
  setShippingAddress(
    @Body() dto: GokwikSetShippingAddressDto,
  ): Promise<GokwikGetCartSuccessResponse> {
    return this.gokwikCartService.setShippingAddress(dto);
  }

  @Post('get-all-discount')
  @HttpCode(HttpStatus.OK)
  @RawResponse()
  getAllDiscount(@Body() dto: GokwikGetCartDto, @Req() request: GokwikCartOwnerRequest) {
    return this.gokwikCartService.getAvailableCoupons(
      request.gokwikResolvedCartId ?? dto.cart_id ?? '',
    );
  }

  @Post('apply-discount')
  @HttpCode(HttpStatus.OK)
  @RawResponse()
  applyDiscount(@Body() dto: GokwikDiscountDto): Promise<GokwikGetCartSuccessResponse> {
    return this.gokwikCartService.applyDiscount(dto);
  }

  @Post('remove-discount')
  @HttpCode(HttpStatus.OK)
  @RawResponse()
  removeDiscount(@Body() dto: GokwikDiscountDto): Promise<GokwikGetCartSuccessResponse> {
    return this.gokwikCartService.removeDiscount(dto);
  }
}
