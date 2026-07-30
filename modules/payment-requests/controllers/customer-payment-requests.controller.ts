import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { getSessionTokenFromRequest } from '@modules/auth/utils/auth-cookie.util';
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

  @ApiOperation({
    summary: 'Start storefront checkout (GoKwik / Shiprocket / native PG)',
    description:
      'Routes by admin flags: `gokwikCheckoutEnabled` → GoKwik SDK payload; ' +
      '`shiprocketCheckoutEnabled` → Shiprocket session; else Razorpay/Cashfree payment link. ' +
      'Body needs `addressId` only. `paymentMethod` is ignored for provider selection. ' +
      'When GoKwik: `paymentData.customerToken` is the Cureka session bearer for the SDK.',
  })
  @ResponseMessage('Checkout session created successfully')
  @Post('checkout')
  checkout(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: CheckoutPaymentRequestDto,
    @Req() req: FastifyRequest,
  ) {
    return this.paymentRequestsService.checkoutFromCart(
      user.sub,
      dto.addressId,
      dto.orderSource,
      getSessionTokenFromRequest(req),
    );
  }

  @ApiOperation({
    summary: 'Start storefront checkout modal (GoKwik / Shiprocket / native PG)',
    description:
      'Same provider routing as POST /checkout. Prefer this for in-page modals (Razorpay Checkout.js / GoKwik SDK). ' +
      'When `checkoutProvider` is `gokwik`, open the GoKwik SDK with `paymentData` — include `customerToken` in SDK init. ' +
      'Do not call Razorpay or /checkout/modal/verify for GoKwik.',
  })
  @ResponseMessage('Checkout session created successfully')
  @Post('checkout/modal')
  checkoutModal(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: CheckoutPaymentRequestDto,
    @Req() req: FastifyRequest,
  ) {
    return this.paymentRequestsService.checkoutModalFromCart(
      user.sub,
      dto.addressId,
      dto.orderSource,
      getSessionTokenFromRequest(req),
    );
  }

  @ApiOperation({
    summary: 'Verify native checkout modal payment (Razorpay / Cashfree)',
    description: 'Not used for GoKwik — GoKwik confirms orders via merchant callbacks.',
  })
  @ResponseMessage('Payment verified successfully')
  @Post('checkout/modal/verify')
  verifyModalCheckout(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: CheckoutVerifyPaymentDto,
  ) {
    return this.paymentRequestsService.verifyModalCheckoutPayment(user.sub, dto);
  }

  @ApiOperation({
    summary: 'Cancel native checkout modal when dismissed',
    description: 'Not used for GoKwik — on SDK close, keep the cart and re-enable the CTA.',
  })
  @ResponseMessage('Checkout cancelled successfully')
  @Post('checkout/modal/cancel')
  cancelModalCheckout(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: CheckoutCancelPaymentDto,
  ) {
    return this.paymentRequestsService.cancelModalCheckoutPayment(user.sub, dto);
  }
}
