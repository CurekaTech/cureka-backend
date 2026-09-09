export type BobCategory = {
  id: string;
  title: string;
};

export type BobProductSummary = {
  id: string;
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
  id: string;
  title: string;
  status: 'ACTIVE' | 'inactive';
  tags: string[];
  description: string;
  onlineStoreUrl: string;
  image: string;
  options: BobProductOption[];
  variants: BobVariant[];
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
    id: string;
    title: string;
    image: string;
  };
};

export type BobLineItem = {
  image: { originalSrc: string };
  product: { id: string; title: string };
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
    /** Prefer product slug — BOB builds storefront product URLs from this id. */
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
