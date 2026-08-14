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
  CreateProductSubscriptionDto,
  PauseProductSubscriptionDto,
  ProductSubscriptionConfigQueryDto,
  UpdateProductSubscriptionAddressDto,
} from '../dto/product-subscription.dto';
import { ProductSubscriptionsService } from '../services/product-subscriptions.service';

@ApiTags('Product Subscriptions')
@ApiBearerAuth()
@UseGuards(SessionCookieGuard, VerifiedUserGuard)
@Controller('subscriptions/products')
export class ProductSubscriptionsController {
  constructor(private readonly productSubscriptionsService: ProductSubscriptionsService) {}

  @ApiOperation({ summary: 'Get subscription config for a product/variant' })
  @ResponseMessage('Subscription config fetched successfully')
  @Get('config')
  @HttpCode(HttpStatus.OK)
  getConfig(@Query() query: ProductSubscriptionConfigQueryDto) {
    return this.productSubscriptionsService.getConfig(query);
  }

  @ApiOperation({ summary: 'Create product subscription (returns payment link)' })
  @ResponseMessage('Subscription created successfully')
  @Post()
  @HttpCode(HttpStatus.OK)
  create(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: CreateProductSubscriptionDto,
  ) {
    return this.productSubscriptionsService.create(user.sub, dto);
  }

  @ApiOperation({ summary: 'List my product subscriptions' })
  @ResponseMessage('Subscriptions fetched successfully')
  @Get()
  @HttpCode(HttpStatus.OK)
  listMine(@CurrentSessionUser() user: IUserSessionContext) {
    return this.productSubscriptionsService.listMine(user.sub);
  }

  @ApiOperation({ summary: 'Get my product subscription' })
  @ResponseMessage('Subscription fetched successfully')
  @Get(':id')
  @HttpCode(HttpStatus.OK)
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
  listPayments(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productSubscriptionsService.listPayments(user.sub, id);
  }

  @ApiOperation({ summary: 'Pause subscription' })
  @ResponseMessage('Subscription paused successfully')
  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
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
  skipNext(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productSubscriptionsService.skipNext(user.sub, id);
  }

  @ApiOperation({ summary: 'Retry pending payment' })
  @ResponseMessage('Payment link regenerated successfully')
  @Post(':id/retry-payment')
  @HttpCode(HttpStatus.OK)
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
  updateAddress(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductSubscriptionAddressDto,
  ) {
    return this.productSubscriptionsService.updateAddress(user.sub, id, dto.addressId);
  }
}
