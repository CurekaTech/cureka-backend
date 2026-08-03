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
   * Priority: gokwik → shiprocket → legacy (Razorpay/Cashfree).
   * Driven by admin settings — both `status=active` AND a truthy `value` are required.
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

  /**
   * Enabled only when status is active AND value is truthy (`true`/`1`/`yes`/`on`).
   * Disabling either field turns the provider off (matches admin toggle + value sync).
   */
  private async isBooleanSettingEnabled(key: string): Promise<boolean> {
    const setting = await this.adminSettingsRepository.findByKey(key);
    if (!setting) {
      return false;
    }

    const status = String(setting.status ?? '')
      .toLowerCase()
      .trim();
    if (status !== AdminSettingStatus.ACTIVE && status !== 'active') {
      return false;
    }

    const normalized = String(setting.value ?? '')
      .toLowerCase()
      .trim();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
  }
}
