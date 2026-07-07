import { Module } from '@nestjs/common';
import { AdminSettingsModule } from '@modules/admin-settings/admin-settings.module';
import { CheckoutResolverService } from './services/checkout-resolver.service';
import { ShiprocketCheckoutService } from './services/shiprocket-checkout.service';
import { LegacyCheckoutProvider } from './providers/legacy-checkout.provider';
import { ShiprocketCheckoutProvider } from './providers/shiprocket-checkout.provider';

@Module({
  imports: [AdminSettingsModule],
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
