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

export interface IUnicommerceErrorResponse {
  message: string;
}
