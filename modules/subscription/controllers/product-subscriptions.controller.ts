import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { ResponseMessage } from '@packages/common';
import {
  CancelProductSubscriptionDto,
  ChangeProductSubscriptionFrequencyDto,
  ActivateProductSubscriptionFromPaidOrderDto,
  CreateProductSubscriptionDto,
  ListMyProductSubscriptionsQueryDto,
  PauseProductSubscriptionDto,
  ProductSubscriptionConfigQueryDto,
  ProductSubscriptionQuoteDto,
  UpdateProductSubscriptionAddressDto,
  UpdateProductSubscriptionQuantityDto,
  VerifyProductSubscriptionPaymentDto,
} from '../dto/product-subscription.dto';
import { ProductSubscriptionsService } from '../services/product-subscriptions.service';

@ApiTags('Product Subscriptions')
@ApiBearerAuth()
@Controller('subscriptions/products')
export class ProductSubscriptionsController {
  constructor(private readonly productSubscriptionsService: ProductSubscriptionsService) {}

  @ApiOperation({ summary: 'Get subscription config for a product/variant (public PDP)' })
  @ResponseMessage('Subscription config fetched successfully')
  @Get('config')
  @HttpCode(HttpStatus.OK)
  getConfig(@Query() query: ProductSubscriptionConfigQueryDto) {
    return this.productSubscriptionsService.getConfig(query);
  }

  @ApiOperation({ summary: 'Server-side Subscribe & Save quote (does not charge)' })
  @ResponseMessage('Subscription quote calculated successfully')
  @Get('quote')
  @HttpCode(HttpStatus.OK)
  quote(@Query() query: ProductSubscriptionQuoteDto) {
    return this.productSubscriptionsService.quote(undefined, query);
  }

  @ApiOperation({ summary: 'Server-side Subscribe & Save quote with membership benefits' })
  @ResponseMessage('Subscription quote calculated successfully')
  @Get('quote/me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  quoteMine(
    @CurrentSessionUser() user: IUserSessionContext,
    @Query() query: ProductSubscriptionQuoteDto,
  ) {
    return this.productSubscriptionsService.quote(user.sub, query);
  }

  @ApiOperation({ summary: 'Create product subscription (returns checkout modal payload)' })
  @ResponseMessage('Subscription created successfully')
  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  create(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: CreateProductSubscriptionDto,
  ) {
    return this.productSubscriptionsService.create(user.sub, dto);
  }

  @ApiOperation({
    summary: 'Activate product subscription from an already-paid checkout order (no second charge)',
  })
  @ResponseMessage('Subscription activated successfully')
  @Post('from-paid-order')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  activateFromPaidOrder(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: ActivateProductSubscriptionFromPaidOrderDto,
  ) {
    return this.productSubscriptionsService.activateFromPaidOrder(user.sub, dto);
  }

  @ApiOperation({ summary: 'List my product subscriptions' })
  @ResponseMessage('Subscriptions fetched successfully')
  @Get()
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  listMine(
    @CurrentSessionUser() user: IUserSessionContext,
    @Query() query: ListMyProductSubscriptionsQueryDto,
  ) {
    return this.productSubscriptionsService.listMine(user.sub, query);
  }

  @ApiOperation({ summary: 'Get my product subscription' })
  @ResponseMessage('Subscription fetched successfully')
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  getMine(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productSubscriptionsService.getMine(user.sub, id);
  }

  @ApiOperation({ summary: 'List payments for my subscription' })
  @ResponseMessage('Subscription payments fetched successfully')
  @Get(':id/payments')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  listPayments(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productSubscriptionsService.listPayments(user.sub, id);
  }

  @ApiOperation({ summary: 'List billing cycles for my subscription' })
  @ResponseMessage('Subscription cycles fetched successfully')
  @Get(':id/cycles')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  listCycles(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productSubscriptionsService.listCycles(user.sub, id);
  }

  @ApiOperation({ summary: 'List status history for my subscription' })
  @ResponseMessage('Subscription history fetched successfully')
  @Get(':id/history')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  listHistory(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productSubscriptionsService.listHistory(user.sub, id);
  }

  @ApiOperation({ summary: 'Get mandate / AutoPay status (do not treat redirects as proof)' })
  @ResponseMessage('Mandate status fetched successfully')
  @Get(':id/mandate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  getMandate(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productSubscriptionsService.getMandate(user.sub, id);
  }

  @ApiOperation({ summary: 'Start mandate authorisation (separate from first product payment)' })
  @ResponseMessage('Mandate authorisation session created')
  @Post(':id/mandate/authorize')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  authorizeMandate(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productSubscriptionsService.authorizeMandate(user.sub, id);
  }

  @ApiOperation({ summary: 'Refresh mandate status from the provider (server-side)' })
  @ResponseMessage('Mandate status refreshed')
  @Post(':id/mandate/refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  refreshMandate(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productSubscriptionsService.refreshMandate(user.sub, id);
  }

  @ApiOperation({ summary: 'Verify Razorpay checkout signature for a subscription cycle' })
  @ResponseMessage('Payment verified successfully')
  @Post(':id/verify-payment')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  verifyPayment(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyProductSubscriptionPaymentDto,
  ) {
    return this.productSubscriptionsService.verifyRazorpayPayment(user.sub, id, dto);
  }

  @ApiOperation({ summary: 'Pay an unpaid billing cycle with a manual checkout session' })
  @ResponseMessage('Checkout session created successfully')
  @Post(':id/cycles/:cycleId/pay')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  payCycle(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
  ) {
    return this.productSubscriptionsService.payCycle(user.sub, id, cycleId);
  }

  @ApiOperation({ summary: 'Pause subscription' })
  @ResponseMessage('Subscription paused successfully')
  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  pause(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PauseProductSubscriptionDto,
  ) {
    return this.productSubscriptionsService.pause(user.sub, id, dto.reason);
  }

  @ApiOperation({ summary: 'Resume subscription' })
  @ResponseMessage('Subscription resumed successfully')
  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  resume(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productSubscriptionsService.resume(user.sub, id);
  }

  @ApiOperation({ summary: 'Cancel subscription' })
  @ResponseMessage('Subscription cancelled successfully')
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  cancel(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelProductSubscriptionDto,
  ) {
    return this.productSubscriptionsService.cancel(user.sub, id, dto.reason);
  }

  @ApiOperation({ summary: 'Skip next delivery / billing cycle' })
  @ResponseMessage('Next delivery skipped successfully')
  @Post(':id/skip-next')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  skipNext(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productSubscriptionsService.skipNext(user.sub, id);
  }

  @ApiOperation({ summary: 'Retry pending payment' })
  @ResponseMessage('Checkout session regenerated successfully')
  @Post(':id/retry-payment')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  retryPayment(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productSubscriptionsService.retryPayment(user.sub, id);
  }

  @ApiOperation({ summary: 'Change subscription frequency' })
  @ResponseMessage('Frequency updated successfully')
  @Patch(':id/frequency')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  changeFrequency(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeProductSubscriptionFrequencyDto,
  ) {
    return this.productSubscriptionsService.changeFrequency(user.sub, id, dto);
  }

  @ApiOperation({ summary: 'Update delivery address' })
  @ResponseMessage('Address updated successfully')
  @Patch(':id/address')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  updateAddress(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductSubscriptionAddressDto,
  ) {
    return this.productSubscriptionsService.updateAddress(user.sub, id, dto.addressId);
  }

  @ApiOperation({ summary: 'Update quantity when the product allows it' })
  @ResponseMessage('Quantity updated successfully')
  @Patch(':id/quantity')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  updateQuantity(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductSubscriptionQuantityDto,
  ) {
    return this.productSubscriptionsService.updateQuantity(user.sub, id, dto);
  }
}
