// ─── Inbound catalog-pull types (used by Unicommerce → Cureka pull endpoints) ──

export interface IUnicommerceItemPrice {
  currency: string;
  listingPrice: number;
  mrp: number;
  msp?: number;
  netSellerPayable?: number;
}

export interface IUnicommerceProductVariant {
  imageUrl?: string;
  productUrl?: string;
  variantId: string;
  title: string;
  sku: string;
  size: string;
  color?: string;
  live: boolean;
  productDescription?: string;
  itemPrice: IUnicommerceItemPrice;
  inventory: number;
  blockedInventory?: number;
  pendency?: number;
}

export interface IUnicommerceCatalogProduct {
  id: string;
  parentTitle: string;
  brand: string;
  variants: IUnicommerceProductVariant[];
  commissionPercentage?: number;
  paymentGatewayCharge?: number;
  logisticsCost?: number;
  additionalInfo?: string;
  created?: string;
}

export interface IUnicommerceProductsResponse {
  products: IUnicommerceCatalogProduct[];
}

export interface IUnicommerceProductsCountResponse {
  count: number;
}

export interface IUnicommerceProductPushResponse {
  status?: string;
  message?: string;
  data?: unknown;
}

export interface IUnicommerceErrorResponse {
  message: string;
}

// ─── Official Unicommerce tenant API — itemTypes/createOrEdit ─────────────────

export interface IUnicommerceItemType {
  /** SKU code — mandatory for create and update. Max 45 chars, no spaces. */
  skuCode: string;
  /** Item display name. Mandatory for create. */
  name: string;
  /** Category code as defined in Unicommerce. Pass 'null' if not set. */
  categoryCode: string;
  type?: 'SIMPLE' | 'BUNDLE';
  description?: string;
  brand?: string;
  /** EAN / barcode */
  ean?: string;
  /** Max retail price */
  maxRetailPrice?: number;
  /** Base / selling price */
  basePrice?: number;
  /** HSN code (6 digits) */
  hsnCode?: string;
  /** Image URL — max 255 chars */
  imageUrl?: string;
  /** Product page URL — max 255 chars */
  productPageUrl?: string;
  /** Weight in grams */
  weight?: number;
  /** Length in mm */
  length?: number;
  /** Width in mm */
  width?: number;
  /** Height in mm */
  height?: number;
  /** Size in LxBxH format (mm) */
  size?: string;
  color?: string;
  /** true = visible; false = disabled */
  enabled?: boolean;
  tags?: string[];
}

export interface IUnicommerceCreateItemTypesPayload {
  itemTypes: IUnicommerceItemType[];
}

export interface IUnicommerceCreateItemTypesResponse {
  successful: boolean;
  message?: string;
  errors?: Array<{
    code?: number;
    fieldName?: string;
    description?: string;
    message?: string;
  }>;
  warnings?: Array<{ code?: number; message?: string; description?: string }>;
  /** Returned for single-item calls */
  itemType?: { skuCode?: string; id?: number };
}

// ─── Official Unicommerce tenant API — channel/itemType/createOrEdit ──────────

export interface IUnicommerceChannelItemTypeData {
  /** Channel code (e.g. CUSTOM) */
  channelCode: string;
  /** Internal catalog SKU */
  skuCode: string;
  /** SKU as listed on this channel (usually same as skuCode) */
  channelSkuCode?: string;
  /** ACTIVE | INACTIVE */
  listingStatus?: string;
  /** Selling / listing price on the channel */
  price?: number;
  /** MRP on the channel */
  mrp?: number;
}

export interface IUnicommerceChannelItemTypePayload {
  channelProductData: IUnicommerceChannelItemTypeData;
}

export interface IUnicommerceChannelItemTypeResponse {
  successful: boolean;
  message?: string;
  errors?: Array<{
    code?: number;
    fieldName?: string;
    description?: string;
    message?: string;
  }>;
  warnings?: Array<{ code?: number; message?: string; description?: string }>;
}
