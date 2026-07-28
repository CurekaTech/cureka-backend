export type GokwikCartMetaField = {
  label: string;
  value: string | number;
};

export type GokwikCartItem = {
  product_id: string;
  variant_id: string;
  collection_ids?: string[];
  sku: string;
  price: number;
  mrp: number;
  total: number;
  quantity: number;
  title: string;
  image_url: string;
  salable_qty: number;
  stock_status: 'IN_STOCK' | 'OUT_OF_STOCK';
  serviceable_status?: boolean;
  metadata: {
    product_details: GokwikCartMetaField[];
  };
};

export type GokwikCartDiscount = {
  amount: number;
  code: string;
  description: string;
  type: string;
  tnc: string;
};

export type GokwikOrderSummaryExtraField = {
  name: string;
  value: number;
};

export type GokwikAvailablePaymentMethod = {
  id: string;
  title: string;
  price: number;
  currency: string;
};

export type GokwikAvailableShippingMethod = {
  id: string;
  price: number;
  title: string;
  currency: string;
};

export type GokwikCart = {
  subtotal: number;
  discount_total: number;
  shipping_total: number;
  total: number;
  currency: string;
  items: GokwikCartItem[];
  discounts: GokwikCartDiscount[];
  wallet_credit_used: number;
  membership_discount: number;
  cashback_amount: number;
  total_tax: number;
  available_payment_methods: GokwikAvailablePaymentMethod[];
  available_coupons: unknown[];
  available_shipping_methods: GokwikAvailableShippingMethod[];
  order_summary_extra_fields: GokwikOrderSummaryExtraField[];
};

export type GokwikGetCartSuccessResponse = {
  data: {
    cart: GokwikCart;
  };
};

export type GokwikGetCartErrorResponse = {
  data: {
    error: string;
  };
};

export type GokwikAvailableCoupon = {
  amount: number;
  code: string;
  description: string;
  type: string;
  tnc: string;
  eligibility: string;
};

export type GokwikAvailableCouponsResponse = {
  data: {
    available_coupons: GokwikAvailableCoupon[];
  };
};
