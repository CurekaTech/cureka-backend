import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { RawResponse } from '@packages/common';
import { GokwikGetCartDto } from '../dto/gokwik-get-cart.dto';
import {
  GokwikDiscountDto,
  GokwikSetShippingAddressDto,
} from '../dto/gokwik-cart-actions.dto';
import { GokwikCallbackGuard } from '../guards/gokwik-callback.guard';
import { GokwikGetCartSuccessResponse } from '../interfaces/gokwik-cart.interface';
import { GokwikCartService } from '../services/gokwik-cart.service';

@Controller('gokwik')
@UseGuards(GokwikCallbackGuard)
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
