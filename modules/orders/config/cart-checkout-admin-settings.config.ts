/**
 * Admin-setting keys consumed during cart/checkout pricing.
 * Add new entries here when introducing additional checkout rules.
 */
export const CartCheckoutAdminSettingKey = {
  SHIPPING_CHARGE_THRESHOLD: 'shipping_charge_threshold',
  HANDLING_CHARGE: 'handling_charge',
} as const;

export type CartCheckoutAdminSettingKey =
  (typeof CartCheckoutAdminSettingKey)[keyof typeof CartCheckoutAdminSettingKey];

export type CartCheckoutAdminSettingUsage =
  | 'free_shipping_threshold'
  | 'cart_flat_fee';

export type CartCheckoutAdminSettingPricingField = 'handlingAmount';

export type CartCheckoutAdminSettingDefinition = {
  key: CartCheckoutAdminSettingKey;
  usage: CartCheckoutAdminSettingUsage;
  /** Target field on cart pricing for `cart_flat_fee` settings. */
  pricingField?: CartCheckoutAdminSettingPricingField;
  /** Optional Nest config path used when DB value is missing/inactive. */
  fallbackConfigPath?: string;
  fallbackDefault: number;
};

export const CART_CHECKOUT_ADMIN_SETTINGS: readonly CartCheckoutAdminSettingDefinition[] = [
  {
    key: CartCheckoutAdminSettingKey.SHIPPING_CHARGE_THRESHOLD,
    usage: 'free_shipping_threshold',
    fallbackConfigPath: 'orders.shipping.freeThreshold',
    fallbackDefault: 900,
  },
  {
    key: CartCheckoutAdminSettingKey.HANDLING_CHARGE,
    usage: 'cart_flat_fee',
    pricingField: 'handlingAmount',
    fallbackDefault: 50,
  },
] as const;

export const CART_CHECKOUT_ADMIN_SETTING_KEYS: CartCheckoutAdminSettingKey[] =
  CART_CHECKOUT_ADMIN_SETTINGS.map((setting) => setting.key);
