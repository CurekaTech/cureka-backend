import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminSettingEntity } from '@modules/admin-settings/entities/admin-setting.entity';
import { AdminSettingStatus } from '@modules/admin-settings/enums/admin-setting-status.enum';
import { AdminSettingsRepository } from '@modules/admin-settings/repositories/admin-settings.repository';
import {
  CART_CHECKOUT_ADMIN_SETTINGS,
  CART_CHECKOUT_ADMIN_SETTING_KEYS,
  CartCheckoutAdminSettingDefinition,
  CartCheckoutAdminSettingKey,
  CartCheckoutAdminSettingPricingField,
} from '../config/cart-checkout-admin-settings.config';
import { roundMoney } from '../utils/money.util';

export type ResolvedCartCheckoutAdminSettings = Record<CartCheckoutAdminSettingKey, number>;

export type ResolvedCartCheckoutFlatFees = Partial<
  Record<CartCheckoutAdminSettingPricingField, number>
>;

@Injectable()
export class CartCheckoutAdminSettingsService {
  constructor(
    private readonly adminSettingsRepository: AdminSettingsRepository,
    private readonly configService: ConfigService,
  ) {}

  async resolveAmounts(): Promise<ResolvedCartCheckoutAdminSettings> {
    const entities = await this.adminSettingsRepository.findByKeys(
      CART_CHECKOUT_ADMIN_SETTING_KEYS,
    );
    const byKey = new Map(entities.map((entity) => [entity.key, entity]));

    const amounts = {} as ResolvedCartCheckoutAdminSettings;
    for (const definition of CART_CHECKOUT_ADMIN_SETTINGS) {
      amounts[definition.key] = this.resolveAmount(definition, byKey.get(definition.key));
    }

    return amounts;
  }

  getFreeShippingThreshold(amounts: ResolvedCartCheckoutAdminSettings): number {
    const definition = CART_CHECKOUT_ADMIN_SETTINGS.find(
      (setting) => setting.usage === 'free_shipping_threshold',
    );
    if (!definition) {
      return 0;
    }
    return amounts[definition.key];
  }

  resolveCartFlatFees(amounts: ResolvedCartCheckoutAdminSettings): ResolvedCartCheckoutFlatFees {
    const flatFees: ResolvedCartCheckoutFlatFees = {};

    for (const definition of CART_CHECKOUT_ADMIN_SETTINGS) {
      if (definition.usage !== 'cart_flat_fee' || !definition.pricingField) {
        continue;
      }

      const current = flatFees[definition.pricingField] ?? 0;
      flatFees[definition.pricingField] = roundMoney(current + amounts[definition.key]);
    }

    return flatFees;
  }

  getPlatformFee(amounts: ResolvedCartCheckoutAdminSettings): number {
    return amounts[CartCheckoutAdminSettingKey.PLATFORM_FEE] ?? 50;
  }

  getPlatformFeeThreshold(amounts: ResolvedCartCheckoutAdminSettings): number {
    return amounts[CartCheckoutAdminSettingKey.PLATFORM_FEE_THRESHOLD] ?? 900;
  }

  getCodCharge(amounts: ResolvedCartCheckoutAdminSettings): number {
    return amounts[CartCheckoutAdminSettingKey.COD_CHARGE] ?? 50;
  }

  getShippingCharge(amounts: ResolvedCartCheckoutAdminSettings): number {
    return amounts[CartCheckoutAdminSettingKey.SHIPPING_CHARGE] ?? 50;
  }

  private resolveAmount(
    definition: CartCheckoutAdminSettingDefinition,
    entity?: AdminSettingEntity,
  ): number {
    if (entity?.status === AdminSettingStatus.ACTIVE) {
      const value = Number(entity.value);
      if (Number.isFinite(value) && value >= 0) {
        return roundMoney(value);
      }
    }

    if (definition.fallbackConfigPath) {
      const configValue = this.configService.get<number>(
        definition.fallbackConfigPath,
        definition.fallbackDefault,
      );
      if (Number.isFinite(configValue) && configValue >= 0) {
        return roundMoney(configValue);
      }
    }

    return roundMoney(definition.fallbackDefault);
  }
}
