/**
 * Admin-setting keys consumed during cart/checkout pricing.
 * Add new entries here when introducing additional checkout rules.
 */
export const CartCheckoutAdminSettingKey = {
  SHIPPING_CHARGE_THRESHOLD: 'shipping_charge_threshold',
  SHIPPING_CHARGE: 'shipping_charge',
  HANDLING_CHARGE: 'handling_charge',
  PLATFORM_FEE: 'platform_fee',
  PLATFORM_FEE_THRESHOLD: 'platform_fee_threshold',
  COD_CHARGE: 'cod_charge',
} as const;

export type CartCheckoutAdminSettingKey =
  (typeof CartCheckoutAdminSettingKey)[keyof typeof CartCheckoutAdminSettingKey];

export type CartCheckoutAdminSettingUsage =
  | 'free_shipping_threshold'
  | 'shipping_charge'
  | 'cart_flat_fee'
  | 'platform_fee'
  | 'platform_fee_threshold'
  | 'cod_charge';

export type CartCheckoutAdminSettingPricingField = 'handlingAmount' | 'platformFee' | 'codCharge' | 'shippingAmount';

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
    key: CartCheckoutAdminSettingKey.SHIPPING_CHARGE,
    usage: 'shipping_charge',
    fallbackConfigPath: 'orders.shipping.flatFee',
    fallbackDefault: 50,
  },
  {
    key: CartCheckoutAdminSettingKey.HANDLING_CHARGE,
    usage: 'cart_flat_fee',
    pricingField: 'handlingAmount',
    fallbackDefault: 50,
  },
  {
    key: CartCheckoutAdminSettingKey.PLATFORM_FEE,
    usage: 'platform_fee',
    pricingField: 'platformFee',
    fallbackDefault: 50,
  },
  {
    key: CartCheckoutAdminSettingKey.PLATFORM_FEE_THRESHOLD,
    usage: 'platform_fee_threshold',
    fallbackDefault: 900,
  },
  {
    key: CartCheckoutAdminSettingKey.COD_CHARGE,
    usage: 'cod_charge',
    pricingField: 'codCharge',
    fallbackDefault: 50,
  },
] as const;

export const CART_CHECKOUT_ADMIN_SETTING_KEYS: CartCheckoutAdminSettingKey[] =
  CART_CHECKOUT_ADMIN_SETTINGS.map((setting) => setting.key);
