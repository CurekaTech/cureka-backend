import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { ResponseMessage } from '@packages/common';
import { CheckoutPaymentRequestDto } from '../dto/checkout-payment-request.dto';
import { PaymentRequestsService } from '../services/payment-requests.service';

@ApiTags('Payment Requests')
@ApiBearerAuth()
@UseGuards(SessionCookieGuard, VerifiedUserGuard)
@Controller('payment-requests')
export class CustomerPaymentRequestsController {
  constructor(private readonly paymentRequestsService: PaymentRequestsService) {}

  @ApiOperation({ summary: 'Create Razorpay payment link from active cart checkout' })
  @ResponseMessage('Payment link generated successfully')
  @Post('checkout')
  checkout(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: CheckoutPaymentRequestDto,
  ) {
    return this.paymentRequestsService.checkoutFromCart(user.sub, dto.addressId);
  }
}
