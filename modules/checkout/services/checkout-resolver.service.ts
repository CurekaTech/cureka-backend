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

  /**
   * Checkout UX flags: `status === active` means enabled (admin toggle).
   * Truthy `value` is also accepted. Stale `value: "false"` with active status still counts as on.
   */
  private async isBooleanSettingEnabled(key: string): Promise<boolean> {
    const setting = await this.adminSettingsRepository.findByKey(key);
    if (!setting) {
      return false;
    }

    const status = String(setting.status ?? '')
      .toLowerCase()
      .trim();
    if (status === AdminSettingStatus.ACTIVE || status === 'active') {
      // Keep value in sync so admin UI and older resolvers stay consistent.
      const normalized = String(setting.value ?? '')
        .toLowerCase()
        .trim();
      if (!['1', 'true', 'yes', 'on'].includes(normalized)) {
        void this.adminSettingsRepository.updateByKey(key, {
          value: 'true',
          updatedBy: 'system',
        });
      }
      return true;
    }

    const normalized = String(setting.value ?? '')
      .toLowerCase()
      .trim();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
  }
}
