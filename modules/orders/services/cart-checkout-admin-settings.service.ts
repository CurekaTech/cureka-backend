import { BadRequestException, Injectable } from '@nestjs/common';
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

export type ShippingSlab = {
  min: number;
  max: number | null;
  charge: number;
};

const DEFAULT_GOKWIK_SHIPPING_SLABS: ShippingSlab[] = [
  { min: 0, max: 199.99, charge: 75 },
  { min: 200, max: 399.99, charge: 55 },
  { min: 400, max: 599.99, charge: 45 },
  { min: 600, max: 899.99, charge: 25 },
  { min: 900, max: null, charge: 0 },
];

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

  async resolveShippingSlabs(): Promise<ShippingSlab[]> {
    const entity = await this.adminSettingsRepository.findByKey('gokwik_shipping_slabs');
    if (entity?.status !== AdminSettingStatus.ACTIVE) {
      return DEFAULT_GOKWIK_SHIPPING_SLABS;
    }

    try {
      const parsed = JSON.parse(entity.value) as unknown;
      if (!Array.isArray(parsed) || !parsed.length) {
        return DEFAULT_GOKWIK_SHIPPING_SLABS;
      }
      const slabs = parsed.map((value) => this.parseShippingSlab(value));
      return slabs.sort((left, right) => left.min - right.min);
    } catch {
      return DEFAULT_GOKWIK_SHIPPING_SLABS;
    }
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

  getCodChargeThreshold(amounts: ResolvedCartCheckoutAdminSettings): number {
    return amounts[CartCheckoutAdminSettingKey.COD_CHARGE_THRESHOLD] ?? 0;
  }

  getHandlingCharge(amounts: ResolvedCartCheckoutAdminSettings): number {
    return amounts[CartCheckoutAdminSettingKey.HANDLING_CHARGE] ?? 50;
  }

  getHandlingChargeThreshold(amounts: ResolvedCartCheckoutAdminSettings): number {
    return amounts[CartCheckoutAdminSettingKey.HANDLING_CHARGE_THRESHOLD] ?? 900;
  }

  getPrepaidCharge(amounts: ResolvedCartCheckoutAdminSettings): number {
    return amounts[CartCheckoutAdminSettingKey.PREPAID_CHARGE] ?? 0;
  }

  getPrepaidChargeThreshold(amounts: ResolvedCartCheckoutAdminSettings): number {
    return amounts[CartCheckoutAdminSettingKey.PREPAID_CHARGE_THRESHOLD] ?? 0;
  }

  getPrepaidDiscountPercent(amounts: ResolvedCartCheckoutAdminSettings): number {
    return amounts[CartCheckoutAdminSettingKey.PREPAID_DISCOUNT_PERCENT] ?? 2;
  }

  getCodMinOrderAmount(amounts: ResolvedCartCheckoutAdminSettings): number {
    return amounts[CartCheckoutAdminSettingKey.COD_MIN_ORDER_AMOUNT] ?? 599;
  }

  getCodMaxOrderAmount(amounts: ResolvedCartCheckoutAdminSettings): number {
    return amounts[CartCheckoutAdminSettingKey.COD_MAX_ORDER_AMOUNT] ?? 10000;
  }

  getShippingCharge(amounts: ResolvedCartCheckoutAdminSettings): number {
    return amounts[CartCheckoutAdminSettingKey.SHIPPING_CHARGE] ?? 50;
  }

  /**
   * COD eligibility is based on merchandise payable (subtotal − coupon discount).
   */
  assertCodOrderEligible(
    payableAmount: number,
    amounts: ResolvedCartCheckoutAdminSettings,
  ): void {
    const min = this.getCodMinOrderAmount(amounts);
    const max = this.getCodMaxOrderAmount(amounts);
    const payable = roundMoney(payableAmount);

    if (payable < min) {
      throw new BadRequestException(
        `Cash on Delivery is available for orders of at least Rs. ${min.toFixed(0)}`,
      );
    }
    if (payable > max) {
      throw new BadRequestException(
        `Cash on Delivery is available for orders up to Rs. ${max.toFixed(0)}`,
      );
    }
  }

  /**
   * A threshold-gated charge applies only while the comparison base
   * (order payable = subtotal − discount) is at or below the configured
   * threshold. Once the payable amount exceeds the threshold, the charge is
   * waived. A threshold of 0 (or less) means the charge is effectively
   * disabled, since no positive payable amount can be ≤ 0.
   */
  isChargeApplicable(payableAmount: number, threshold: number): boolean {
    if (threshold <= 0) {
      return false;
    }
    return payableAmount <= threshold;
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

  private parseShippingSlab(value: unknown): ShippingSlab {
    if (!value || typeof value !== 'object') {
      throw new Error('Invalid shipping slab');
    }
    const slab = value as Record<string, unknown>;
    const min = Number(slab['min']);
    const max = slab['max'] === null ? null : Number(slab['max']);
    const charge = Number(slab['charge']);
    if (
      !Number.isFinite(min) ||
      min < 0 ||
      (max !== null && (!Number.isFinite(max) || max < min)) ||
      !Number.isFinite(charge) ||
      charge < 0
    ) {
      throw new Error('Invalid shipping slab');
    }
    return { min: roundMoney(min), max: max === null ? null : roundMoney(max), charge: roundMoney(charge) };
  }
}
