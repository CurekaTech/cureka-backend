import { Global, Module } from '@nestjs/common';
import { AdminSettingsModule } from '@modules/admin-settings/admin-settings.module';
import { CheckoutResolverService } from './services/checkout-resolver.service';
import { ShiprocketCheckoutService } from './services/shiprocket-checkout.service';
import { LegacyCheckoutProvider } from './providers/legacy-checkout.provider';
import { ShiprocketCheckoutProvider } from './providers/shiprocket-checkout.provider';
import { PublicCheckoutController } from './controllers/public-checkout.controller';

/**
 * Global so CheckoutResolverService is available wherever VerifiedUserGuard
 * (and other cross-module consumers) are instantiated.
 */
@Global()
@Module({
  imports: [AdminSettingsModule],
  controllers: [PublicCheckoutController],
  providers: [
    CheckoutResolverService,
    ShiprocketCheckoutService,
    LegacyCheckoutProvider,
    ShiprocketCheckoutProvider,
  ],
  exports: [
    CheckoutResolverService,
    ShiprocketCheckoutService,
    LegacyCheckoutProvider,
    ShiprocketCheckoutProvider,
  ],
})
export class CheckoutModule {}
