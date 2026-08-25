import { Body, Controller, Headers, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { CartService } from '@modules/orders/services/cart.service';
import { GokwikCheckoutTokenService } from '@modules/auth/services/gokwik-checkout-token.service';
import { ResponseMessage } from '@packages/common';
import { CheckoutCancelPaymentDto } from '../dto/checkout-cancel.dto';
import { CheckoutPaymentRequestDto } from '../dto/checkout-payment-request.dto';
import { CheckoutVerifyPaymentDto } from '../dto/checkout-verify.dto';
import { CheckoutIdempotencyService } from '../services/checkout-idempotency.service';
import { PaymentRequestsService } from '../services/payment-requests.service';

@ApiTags('Payment Requests')
@ApiBearerAuth()
@UseGuards(SessionCookieGuard, VerifiedUserGuard)
@Controller('payment-requests')
export class CustomerPaymentRequestsController {
  constructor(
    private readonly paymentRequestsService: PaymentRequestsService,
    private readonly gokwikCheckoutTokenService: GokwikCheckoutTokenService,
    private readonly cartService: CartService,
    private readonly checkoutIdempotencyService: CheckoutIdempotencyService,
  ) {}

  @ApiOperation({
    summary: 'Start storefront checkout (GoKwik / Shiprocket / native PG)',
    description:
      'Routes by admin flags: `gokwikCheckoutEnabled` → GoKwik SDK payload; ' +
      '`shiprocketCheckoutEnabled` → Shiprocket session; else Razorpay/Cashfree payment link/QR. ' +
      'Optional `paymentMethod` (RAZORPAY/CASHFREE/WALLET) applies prepaid % discount to the charged QR amount. ' +
      'Provider selection still follows admin gateway flags. ' +
      'When GoKwik: `paymentData.customerToken` is a short-lived opaque checkout token (never the HttpOnly user_session). ' +
      'Pass `Idempotency-Key` to safely retry without duplicating payment requests.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Client UUID — retries with the same key return the cached response for 24h',
  })
  @ResponseMessage('Checkout session created successfully')
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  checkout(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: CheckoutPaymentRequestDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.checkoutIdempotencyService.run(user.sub, 'checkout', idempotencyKey, () =>
      this.paymentRequestsService.checkoutFromCart(
        user.sub,
        dto.addressId,
        dto.orderSource,
        dto.paymentMethod,
      ),
    );
  }

  @ApiOperation({
    summary: 'Start storefront checkout modal (GoKwik / Shiprocket / native PG)',
    description:
      'Same provider routing as POST /checkout. Prefer this for in-page modals (Razorpay Checkout.js / Cashfree). ' +
      'Pass `paymentMethod: RAZORPAY|CASHFREE` so prepaid 2% is baked into `paymentData.amount` / QR. ' +
      'FE must open the SDK with `paymentData.amount` / `paymentSessionId` from this response — do not pass cart subtotal. ' +
      'When `checkoutProvider` is `gokwik`, open the GoKwik SDK with `paymentData` ' +
      '(uses short-lived opaque `customerToken`, not user_session). ' +
      'Pass `Idempotency-Key` to safely retry without duplicating payment requests.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Client UUID — retries with the same key return the cached response for 24h',
  })
  @ResponseMessage('Checkout session created successfully')
  @Post('checkout/modal')
  @HttpCode(HttpStatus.OK)
  checkoutModal(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: CheckoutPaymentRequestDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.checkoutIdempotencyService.run(user.sub, 'checkout-modal', idempotencyKey, () =>
      this.paymentRequestsService.checkoutModalFromCart(
        user.sub,
        dto.addressId,
        dto.orderSource,
        dto.paymentMethod,
      ),
    );
  }

  /**
   * @deprecated Prefer `paymentData.customerToken` from checkout/modal.
   * Kept for FE that still calls a dedicated bridge. MUST never return user_session.
   * Frontend should remove `GET /api/checkout/gokwik-customer-token` after this ships.
   */
  @ApiOperation({
    summary: '[Deprecated] Mint GoKwik customerToken only',
    description:
      'Returns a short-lived opaque gokwik_checkout token for the active cart. ' +
      'Does NOT expose the HttpOnly user_session. Prefer checkout/modal paymentData.customerToken.',
    deprecated: true,
  })
  @ResponseMessage('GoKwik customer token created successfully')
  @Post('checkout/gokwik-customer-token')
  @HttpCode(HttpStatus.OK)
  async mintGokwikCustomerToken(@CurrentSessionUser() user: IUserSessionContext) {
    const cart = await this.cartService.getActiveCartEntity(user.sub);
    if (!cart) {
      return { customerToken: null, reason: 'cart_not_found' };
    }
    const customerToken = await this.gokwikCheckoutTokenService.issue({
      userId: user.sub,
      cartId: cart.id,
    });
    return {
      customerToken,
      merchantCheckoutId: cart.id,
      scope: 'gokwik_checkout',
    };
  }

  @ApiOperation({
    summary: 'Verify native checkout modal payment (Razorpay / Cashfree)',
    description: 'Not used for GoKwik — GoKwik confirms orders via merchant callbacks.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Client UUID — retries with the same key return the cached response for 24h',
  })
  @ResponseMessage('Payment verified successfully')
  @Post('checkout/modal/verify')
  @HttpCode(HttpStatus.OK)
  verifyModalCheckout(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: CheckoutVerifyPaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.checkoutIdempotencyService.run(user.sub, 'checkout-modal-verify', idempotencyKey, () =>
      this.paymentRequestsService.verifyModalCheckoutPayment(user.sub, dto),
    );
  }

  @ApiOperation({
    summary: 'Cancel native checkout modal when dismissed',
    description: 'Not used for GoKwik — on SDK close, keep the cart and re-enable the CTA.',
  })
  @ResponseMessage('Checkout cancelled successfully')
  @Post('checkout/modal/cancel')
  @HttpCode(HttpStatus.OK)
  cancelModalCheckout(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: CheckoutCancelPaymentDto,
  ) {
    return this.paymentRequestsService.cancelModalCheckoutPayment(user.sub, dto);
  }
}
