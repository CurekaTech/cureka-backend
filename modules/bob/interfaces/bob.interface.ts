export type BobCategory = {
  id: number;
  title: string;
  parentId: number | null;
  parentTitle: string | null;
};

export type BobProductSummary = {
  id: number;
  title: string;
  status: 'ACTIVE' | 'inactive';
  tags: string[];
};

export type BobSelectedOption = {
  name: string;
  value: string;
};

export type BobProductOption = {
  name: string;
  values: string[];
};

export type BobVariant = {
  id: string;
  title: string;
  price: string;
  inventoryQuantity: number;
  inventoryPolicy: 'continue' | 'deny';
  inventoryManaged: boolean;
  image: string;
  description?: string;
  selectedOptions: BobSelectedOption[];
};

export type BobProductDetail = {
  id: number;
  title: string;
  status: 'ACTIVE' | 'inactive';
  tags: string[];
  description: string;
  onlineStoreUrl: string;
  image: string;
  options: BobProductOption[];
  variants: BobVariant[];
};

/** GET /bob/products. Product objects stay the same; paging fields sit beside them. */
export type BobProductList = {
  products: BobProductDetail[];
  page: number;
  limit: number;
  /** Matching products for the same search/filter, before this page is sliced. */
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type BobVariantDetail = {
  id: string;
  title: string;
  price: string;
  inventoryQuantity: number;
  inventoryPolicy: 'continue' | 'deny';
  inventoryManaged: boolean;
  image: string;
  product: {
    id: number;
    title: string;
    image: string;
  };
};

export type BobLineItem = {
  image: { originalSrc: string };
  /** Catalogue / WooCommerce product id, same as GET /bob/products. UUID only if the catalogue id is missing. */
  product: { id: string | number; title: string };
  variant: {
    id: string;
    title: string;
    price: string;
    weight: string;
    sku: string;
  };
  variantTitle: string;
  quantity: number;
};

export type BobOrderPayload = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  fullyPaid: boolean;
  cancelReason: string | null;
  cancelledAt: string | null;
  note: string | null;
  channel: string;
  shippingAddress: {
    name: string;
    phone: string;
    address1: string;
    address2: string;
    city: string;
    province: string;
    country: string | null;
    zip: string | null;
  };
  total_amount: string;
  currencyCode: string;
  lineItems: BobLineItem[];
  shipment_details: {
    status: string;
    tracking_info: string;
  };
};

export type BobPersonalDetails = {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  ordersCount: number;
  totalSpent: string;
  currencyCode: string;
  defaultAddress: Record<string, unknown> | null;
  email: string;
  lastOrder: BobOrderPayload | null;
};

export type BobFulfillmentPayload = {
  fulfillment_id: string;
  id: string;
  id_alias: string;
  lineItems: BobLineItem[];
  customer: {
    email: string;
    first_name: string;
    last_name: string;
    orders_count?: number | null;
    total_spent?: number | null;
    last_order_id?: string | null;
    phone: string;
  };
  order_details: {
    total_price: number;
    total_tax: number;
    total_discount: number;
    currency: string;
  };
  tracking_info: {
    tracking_number: string;
    tracking_url: string;
    tracking_company_name: string;
    shipping_status: string;
  };
  /** Required by BOB fulfillments-create schema (root-level, not only customer.phone). */
  phone: string;
  fulfilled_at: string;
};

export type BobFulfillmentEventStatus = 'Delivered' | 'In-transit' | 'Returned' | 'Dispatched';

export type BobFulfillmentEventPayload = {
  delivery_id: string;
  id: string;
  id_alias: string;
  fulfillment_id: string;
  status: BobFulfillmentEventStatus;
  delivered_at: string;
};

export type BobAbandonedCartPayload = {
  checkout_id: string;
  cart_recovery_url: string;
  line_items: Array<{
    /** Variant SKU or variant UUID of the exact size/pack in the cart. */
    id: string;
    name: string;
    image: { originalSrc: string };
    quantity: number;
    price: number;
    /** Absolute Cureka PDP URL (BOB may use this instead of /products/{id}). */
    product_url?: string;
  }>;
  customer: {
    email: string;
    first_name: string;
    last_name: string;
    orders_count?: number;
    total_spent?: number;
    last_order_id?: string;
    phone: string;
  };
  order_details: {
    total_price: number;
    total_tax: number;
    total_discount: number;
    currency: string;
  };
  address: {
    billing_address: {
      address: string;
      city: string;
      province: string;
      country: string;
      zip: string;
    };
    shipping_address: {
      address: string;
      city: string;
      province: string;
      country: string;
      zip: string;
    };
  };
  phone: string;
  created_at: string;
};

/** GoKwik Live Mode body for POST /abancart-external. */
export type BobGokwikAbandonedCartPayload = {
  c_id: string;
  request_id: string;
  abc_url: string;
  customer: {
    email: string;
    firstname: string;
    lastname: string;
    phone: string;
  };
  address: {
    address1: string;
    city: string;
    province: string;
    zip: string;
    country: string;
    country_code: string;
    firstname: string;
    lastname: string;
    phone: string;
  };
  items: Array<{
    id: string;
    product_id: string | number;
    variant_id: string | number;
    title: string;
    quantity: number;
    price: number;
    image_url?: string;
  }>;
  total_price: number;
};
