import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { isPromotionalOffersEnabled } from '@modules/promotional-offers/utils/promotional-offers-enabled.util';
import { CheckoutResolverService } from '../services/checkout-resolver.service';

@ApiTags('Public Checkout')
@Controller('public/checkout')
export class PublicCheckoutController {
  constructor(
    private readonly checkoutResolver: CheckoutResolverService,
    private readonly configService: ConfigService,
  ) {}

  @ApiOperation({
    summary: 'Resolve active checkout provider by admin priority',
    description:
      'Cart priority: gokwik > shiprocket > legacy. `nativeGateway` is the admin Cashfree/Razorpay fallback used when GoKwik is off, and the only gateway for product subscriptions.',
  })
  @ResponseMessage('Checkout provider resolved successfully')
  @Get('provider')
  @HttpCode(HttpStatus.OK)
  async getProvider() {
    const [checkoutProvider, nativeGateway] = await Promise.all([
      this.checkoutResolver.resolveProvider(),
      this.checkoutResolver.resolveNativeGateway(),
    ]);
    return {
      checkoutProvider,
      gateway: checkoutProvider,
      nativeGateway,
      /** UI-only hint for native useWallet; server still enforces WALLET_CHECKOUT_ENABLED. */
      walletCheckoutEnabled:
        this.configService.get<boolean>('wallet.checkoutEnabled') === true,
      promotionalOffersEnabled: isPromotionalOffersEnabled(this.configService),
    };
  }
}
