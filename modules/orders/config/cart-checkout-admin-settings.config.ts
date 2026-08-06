/**
 * Admin-setting keys consumed during cart/checkout pricing.
 * Add new entries here when introducing additional checkout rules.
 */
export const CartCheckoutAdminSettingKey = {
  SHIPPING_CHARGE_THRESHOLD: 'shipping_charge_threshold',
  SHIPPING_CHARGE: 'shipping_charge',
  HANDLING_CHARGE: 'handling_charge',
  HANDLING_CHARGE_THRESHOLD: 'handling_charge_threshold',
  PLATFORM_FEE: 'platform_fee',
  PLATFORM_FEE_THRESHOLD: 'platform_fee_threshold',
  COD_CHARGE: 'cod_charge',
  COD_CHARGE_THRESHOLD: 'cod_charge_threshold',
  COD_MIN_ORDER_AMOUNT: 'cod_min_order_amount',
  COD_MAX_ORDER_AMOUNT: 'cod_max_order_amount',
  PREPAID_CHARGE: 'prepaid_charge',
  PREPAID_CHARGE_THRESHOLD: 'prepaid_charge_threshold',
  PREPAID_DISCOUNT_PERCENT: 'prepaid_discount_percent',
} as const;

export type CartCheckoutAdminSettingKey =
  (typeof CartCheckoutAdminSettingKey)[keyof typeof CartCheckoutAdminSettingKey];

export type CartCheckoutAdminSettingUsage =
  | 'free_shipping_threshold'
  | 'shipping_charge'
  | 'cart_flat_fee'
  | 'handling_charge_threshold'
  | 'platform_fee'
  | 'platform_fee_threshold'
  | 'cod_charge'
  | 'cod_charge_threshold'
  | 'cod_min_order_amount'
  | 'cod_max_order_amount'
  | 'prepaid_charge'
  | 'prepaid_charge_threshold'
  | 'prepaid_discount_percent';

export type CartCheckoutAdminSettingPricingField = 'handlingAmount' | 'platformFee' | 'codCharge' | 'shippingAmount' | 'prepaidCharge';

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
    key: CartCheckoutAdminSettingKey.HANDLING_CHARGE_THRESHOLD,
    usage: 'handling_charge_threshold',
    fallbackDefault: 900,
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
    fallbackDefault: 50,
  },
  {
    key: CartCheckoutAdminSettingKey.COD_CHARGE_THRESHOLD,
    usage: 'cod_charge_threshold',
    fallbackDefault: 0,
  },
  {
    key: CartCheckoutAdminSettingKey.COD_MIN_ORDER_AMOUNT,
    usage: 'cod_min_order_amount',
    fallbackDefault: 599,
  },
  {
    key: CartCheckoutAdminSettingKey.COD_MAX_ORDER_AMOUNT,
    usage: 'cod_max_order_amount',
    fallbackDefault: 10000,
  },
  {
    key: CartCheckoutAdminSettingKey.PREPAID_CHARGE,
    usage: 'prepaid_charge',
    pricingField: 'prepaidCharge',
    fallbackDefault: 0,
  },
  {
    key: CartCheckoutAdminSettingKey.PREPAID_CHARGE_THRESHOLD,
    usage: 'prepaid_charge_threshold',
    fallbackDefault: 0,
  },
  {
    key: CartCheckoutAdminSettingKey.PREPAID_DISCOUNT_PERCENT,
    usage: 'prepaid_discount_percent',
    fallbackDefault: 2,
  },
] as const;

export const CART_CHECKOUT_ADMIN_SETTING_KEYS: CartCheckoutAdminSettingKey[] =
  CART_CHECKOUT_ADMIN_SETTINGS.map((setting) => setting.key);
