export type GokwikCartMetaField = {
  label: string;
  value: string;
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
  metaData: GokwikCartMetaField[];
  metadata?: {
    product_details?: GokwikCartMetaField[];
    pre_checkout_location: {
      city: string;
      state: string;
      pincode: string;
      country: string;
    };
    edd?: {
      shipment_group: number;
      default: { min_date: string; max_date: string };
      by_shipping_method: Array<{
        shipping_id: string;
        min_date: string;
        max_date: string;
      }>;
    };
    try_and_buy?: { enabled: boolean; instructions: string };
    non_serviceable_message?: string;
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
  available_payment_methods: unknown[];
  available_coupons: unknown[];
  available_shipping_methods: unknown[];
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
