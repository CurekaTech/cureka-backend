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

// ─── Official Unicommerce tenant API — /services/rest/v1/channel/createChannelItem ───

export interface IUnicommerceChannelItemType {
  /** Channel code (e.g. CUSTOM) */
  channelCode: string;
  /** SKU on the channel — typically same as sellerSkuCode */
  channelProductId: string;
  /** Seller's own SKU code */
  sellerSkuCode: string;
  /** Unicommerce catalog SKU (itemType skuCode) */
  skuCode: string;
  /** Whether the listing is live on the channel */
  live?: boolean;
  /** Whether the item is verified */
  verified?: boolean;
}

export interface IUnicommerceCreateChannelItemPayload {
  channelItemType: IUnicommerceChannelItemType;
}

export interface IUnicommerceCreateChannelItemResponse {
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

// Keep old aliases so existing code compiles during migration
/** @deprecated Use IUnicommerceChannelItemType */
export type IUnicommerceChannelItemTypeData = IUnicommerceChannelItemType;
/** @deprecated Use IUnicommerceCreateChannelItemPayload */
export type IUnicommerceChannelItemTypePayload = IUnicommerceCreateChannelItemPayload;
/** @deprecated Use IUnicommerceCreateChannelItemResponse */
export type IUnicommerceChannelItemTypeResponse = IUnicommerceCreateChannelItemResponse;
