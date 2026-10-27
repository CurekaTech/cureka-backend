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
   * Cart priority: gokwik → shiprocket → legacy (Cashfree/Razorpay).
   * Enabled when admin status is active or the value is truthy.
   * Subscription carts skip this and use the native gateway only.
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
   * Native prepaid gateway for cart fallback and product subscriptions.
   * Cashfree wins when both native gateways are on, matching payment resolution.
   * GoKwik is not a native gateway.
   */
  async resolveNativeGateway(): Promise<'cashfree' | 'razorpay' | null> {
    if (await this.isBooleanSettingEnabled('cash_free')) {
      return 'cashfree';
    }
    if (await this.isBooleanSettingEnabled('razor_pay')) {
      return 'razorpay';
    }
    return null;
  }

  /**
   * Admin toggles often update only status, and older rows kept value "false"
   * while status was active. Either an active status or a truthy value enables
   * the flag. A real disable sets both inactive and a false value together.
   */
  private async isBooleanSettingEnabled(key: string): Promise<boolean> {
    const setting = await this.adminSettingsRepository.findByKey(key);
    if (!setting) {
      return false;
    }

    const status = String(setting.status ?? '')
      .toLowerCase()
      .trim();
    const statusEnabled = status === AdminSettingStatus.ACTIVE || status === 'active';
    const normalized = String(setting.value ?? '')
      .toLowerCase()
      .trim();
    const valueEnabled = ['1', 'true', 'yes', 'on'].includes(normalized);
    return statusEnabled || valueEnabled;
  }
}
