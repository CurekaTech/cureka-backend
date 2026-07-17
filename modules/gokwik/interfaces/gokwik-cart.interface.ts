export type GokwikCartMetaField = {
  label: string;
  value: string;
};

export type GokwikCartItem = {
  product_id: string;
  variant_id: string;
  sku: string;
  price: number;
  mrp: number;
  total: number;
  quantity: number;
  title: string;
  image_url: string;
  salable_qty: number;
  stock_status: 'IN_STOCK' | 'OUT_OF_STOCK';
  metaData: GokwikCartMetaField[];
  metadata?: {
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

export type GokwikCart = {
  subtotal: number;
  discount_total: number;
  shipping_total: number;
  total: number;
  currency: string;
  items: GokwikCartItem[];
  discounts: GokwikCartDiscount[];
  order_summary_extra_fields?: GokwikOrderSummaryExtraField[];
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
