import { Injectable } from '@nestjs/common';
import { AdminSettingsRepository } from '@modules/admin-settings/repositories/admin-settings.repository';
import { AdminSettingStatus } from '@modules/admin-settings/enums/admin-setting-status.enum';
import { CheckoutProviderName } from '../interfaces/checkout-provider.interface';

export const GOKWIK_CHECKOUT_ENABLED_KEY = 'gokwikCheckoutEnabled';
export const SHIPROCKET_CHECKOUT_ENABLED_KEY = 'shiprocketCheckoutEnabled';

@Injectable()
export class CheckoutResolverService {
  constructor(private readonly adminSettingsRepository: AdminSettingsRepository) {}

  /**
   * Priority: gokwik → shiprocket → legacy.
   * GoKwik / Shiprocket are checkout UX providers; PG resolution stays separate.
   */
  async resolveProvider(): Promise<CheckoutProviderName> {
    if (await this.isGokwikCheckoutEnabled()) {
      return 'gokwik';
    }
    if (await this.isShiprocketCheckoutEnabled()) {
      return 'shiprocket';
    }
    return 'legacy';
  }

  async isGokwikCheckoutEnabled(): Promise<boolean> {
    return this.isBooleanSettingEnabled(GOKWIK_CHECKOUT_ENABLED_KEY);
  }

  async isShiprocketCheckoutEnabled(): Promise<boolean> {
    return this.isBooleanSettingEnabled(SHIPROCKET_CHECKOUT_ENABLED_KEY);
  }

  private async isBooleanSettingEnabled(key: string): Promise<boolean> {
    const setting = await this.adminSettingsRepository.findByKey(key);
    if (!setting || setting.status !== AdminSettingStatus.ACTIVE) {
      return false;
    }
    return ['1', 'true', 'yes', 'on'].includes(setting.value.toLowerCase().trim());
  }
}
