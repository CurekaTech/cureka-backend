import { Injectable } from '@nestjs/common';
import { AdminSettingsRepository } from '@modules/admin-settings/repositories/admin-settings.repository';
import { AdminSettingStatus } from '@modules/admin-settings/enums/admin-setting-status.enum';
import { CheckoutProviderName } from '../interfaces/checkout-provider.interface';

export const SHIPROCKET_CHECKOUT_ENABLED_KEY = 'shiprocketCheckoutEnabled';

@Injectable()
export class CheckoutResolverService {
  constructor(private readonly adminSettingsRepository: AdminSettingsRepository) {}

  async resolveProvider(): Promise<CheckoutProviderName> {
    return (await this.isShiprocketCheckoutEnabled()) ? 'shiprocket' : 'legacy';
  }

  async isShiprocketCheckoutEnabled(): Promise<boolean> {
    const setting = await this.adminSettingsRepository.findByKey(SHIPROCKET_CHECKOUT_ENABLED_KEY);
    if (!setting || setting.status !== AdminSettingStatus.ACTIVE) {
      return false;
    }
    return ['1', 'true', 'yes', 'on'].includes(setting.value.toLowerCase().trim());
  }
}
