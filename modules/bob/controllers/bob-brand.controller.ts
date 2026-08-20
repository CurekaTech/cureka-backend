import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RawResponse } from '@packages/common';
import { BobCancelOrderDto } from '../dto/bob.dto';
import { BobApiKeyGuard } from '../guards/bob-api-key.guard';
import { BobBrandService } from '../services/bob-brand.service';

@ApiTags('BOB / BusinessOnBot notifications')
@ApiHeader({ name: 'x-guest-id', required: true })
@UseGuards(BobApiKeyGuard)
@RawResponse()
@Controller('bob')
export class BobBrandController {
  constructor(private readonly bobBrandService: BobBrandService) {}

  @ApiOperation({ summary: 'BOB: get order by id / order number' })
  @Get('order/:orderId')
  getOrder(@Param('orderId') orderId: string) {
    return this.bobBrandService.getOrder(orderId);
  }

  @ApiOperation({ summary: 'BOB: customer details by email' })
  @Get('personal-details')
  getByEmail(@Query('email') email: string) {
    return this.bobBrandService.getPersonalDetailsByEmail(email);
  }

  @ApiOperation({ summary: 'BOB: customer details by phone' })
  @Get('personal-details/:phone')
  getByPhone(@Param('phone') phone: string) {
    return this.bobBrandService.getPersonalDetailsByPhone(phone);
  }

  @ApiOperation({ summary: 'BOB: last 3 orders by phone' })
  @Get('get-orders/:phone')
  getOrders(@Param('phone') phone: string) {
    return this.bobBrandService.getLastThreeOrders(phone);
  }

  @ApiOperation({ summary: 'BOB: cancel an order' })
  @Post('cancel-order')
  cancel(@Body() dto: BobCancelOrderDto) {
    return this.bobBrandService.cancelOrder(dto);
  }
}
