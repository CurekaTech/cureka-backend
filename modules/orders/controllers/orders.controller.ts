import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { ResponseMessage } from '@packages/common';
import { CheckoutDto } from '../dto/checkout.dto';
import { CancelOrderDto, OrderQueryDto, PlaceOrderDto } from '../dto/order.dto';
import { OrdersService } from '../services/orders.service';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(SessionCookieGuard, VerifiedUserGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @ApiOperation({
    summary: 'Validate checkout details',
    description:
      'Returns cart pricing summary plus `checkoutProvider` (`gokwik` | `shiprocket` | `legacy`). ' +
      'Does not start payment. To pay/open a gateway modal, call POST /payment-requests/checkout (or /checkout/modal). ' +
      '`paymentMethod` is optional and only affects fee lines (COD charge / prepaid discount) — it does not select GoKwik.',
  })
  @ResponseMessage('Checkout validated successfully')
  @Post('checkout')
  checkout(@CurrentSessionUser() user: IUserSessionContext, @Body() dto: CheckoutDto) {
    return this.ordersService.checkout(user.sub, dto);
  }

  @ApiOperation({ summary: 'Place order from active cart' })
  @ResponseMessage('Order placed successfully')
  @Post()
  placeOrder(@CurrentSessionUser() user: IUserSessionContext, @Body() dto: PlaceOrderDto) {
    return this.ordersService.placeOrder(user.sub, dto);
  }

  @ApiOperation({ summary: 'List my orders' })
  @ResponseMessage('Orders fetched successfully')
  @Get()
  findMyOrders(@CurrentSessionUser() user: IUserSessionContext, @Query() query: OrderQueryDto) {
    return this.ordersService.findMyOrders(user.sub, query);
  }

  @ApiOperation({ summary: 'Get my order by id' })
  @ResponseMessage('Order fetched successfully')
  @Get(':id')
  findOne(@CurrentSessionUser() user: IUserSessionContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOne(user.sub, id);
  }

  @ApiOperation({ summary: 'Reorder items from a past order into the active cart' })
  @ResponseMessage('Items added to cart successfully')
  @Post(':id/reorder')
  reorder(@CurrentSessionUser() user: IUserSessionContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.reorder(user.sub, id);
  }

  @ApiOperation({ summary: 'Cancel my order' })
  @ResponseMessage('Order cancelled successfully')
  @Patch(':id/cancel')
  cancel(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancel(user.sub, id, dto);
  }
}
