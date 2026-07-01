import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { ResponseMessage } from '@packages/common';
import { CheckoutCancelPaymentDto } from '../dto/checkout-cancel.dto';
import { CheckoutPaymentRequestDto } from '../dto/checkout-payment-request.dto';
import { CheckoutVerifyPaymentDto } from '../dto/checkout-verify.dto';
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

  @ApiOperation({ summary: 'Create Razorpay order for storefront checkout modal' })
  @ResponseMessage('Razorpay order created successfully')
  @Post('checkout/modal')
  checkoutModal(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: CheckoutPaymentRequestDto,
  ) {
    return this.paymentRequestsService.checkoutModalFromCart(user.sub, dto.addressId);
  }

  @ApiOperation({ summary: 'Verify Razorpay checkout modal payment' })
  @ResponseMessage('Payment verified successfully')
  @Post('checkout/modal/verify')
  verifyModalCheckout(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: CheckoutVerifyPaymentDto,
  ) {
    return this.paymentRequestsService.verifyModalCheckoutPayment(user.sub, dto);
  }

  @ApiOperation({ summary: 'Cancel Razorpay checkout modal when dismissed' })
  @ResponseMessage('Checkout cancelled successfully')
  @Post('checkout/modal/cancel')
  cancelModalCheckout(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: CheckoutCancelPaymentDto,
  ) {
    return this.paymentRequestsService.cancelModalCheckoutPayment(user.sub, dto);
  }
}
