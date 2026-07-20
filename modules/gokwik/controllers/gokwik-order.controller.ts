import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { RawResponse } from '@packages/common';
import { GokwikCheckOrderExistsDto } from '../dto/gokwik-check-order-exists.dto';
import { GokwikCreateOrderDto } from '../dto/gokwik-create-order.dto';
import { GokwikPlaceOrderDto } from '../dto/gokwik-place-order.dto';
import { GokwikCallbackGuard } from '../guards/gokwik-callback.guard';
import {
  GokwikCheckOrderExistsResponse,
  GokwikCreateOrderResponse,
  GokwikPlaceOrderResponse,
} from '../interfaces/gokwik-order.interface';
import { GokwikOrderService } from '../services/gokwik-order.service';

@Controller('gokwik')
@UseGuards(GokwikCallbackGuard)
export class GokwikOrderController {
  constructor(private readonly gokwikOrderService: GokwikOrderService) {}

  @Post('create-order')
  @RawResponse()
  createOrder(@Body() dto: GokwikCreateOrderDto): Promise<GokwikCreateOrderResponse> {
    return this.gokwikOrderService.createOrder(dto);
  }

  @Post('place-order')
  @RawResponse()
  placeOrder(@Body() dto: GokwikPlaceOrderDto): Promise<GokwikPlaceOrderResponse> {
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
