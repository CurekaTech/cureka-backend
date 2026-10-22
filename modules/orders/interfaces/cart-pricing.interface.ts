import { IStorageFileReferenceResponse } from '@packages/storage';

export type CartLineItemProductDetail = {
  label: string;
  value: string;
};

export type CartLineItem = {
  id: string;
  productId: string;
  variantId: string;
  /** Storefront product slug — used by BOB abandoned-cart product URL resolution. */
  productSlug: string | null;
  /**
   * Storefront PDP path for BOB (prefer variant product_page_url / product single_product_url).
   * Do not derive from live category relations alone — those can be stale vs the storefront canonical URL.
   */
  productPagePath: string | null;
  productName: string;
  /** Variant slug when present, otherwise product slug — used for storefront PDP links. */
  slug: string;
  /** Exact variant product page path when present (preferred over slug for PDP href). */
  productPageUrl: string | null;
  sku: string;
  variantLabel: string | null;
  quantity: number;
  unitPrice: number;
  /** Variant MRP when available (used by GoKwik cart exchange). */
  mrp: number | null;
  totalPrice: number;
  stock: number;
  /** Salable for checkout — false when product/variant inactive or (when enabled) zero stock. */
  inStock: boolean;
  isAvailable: boolean;
  /** Variant-level COD eligibility (`product_variants.cod_available`). */
  codAvailable: boolean;
  primaryImageUrl: IStorageFileReferenceResponse | null;
  productDetails: CartLineItemProductDetail[];
  categoryId: string;
  subCategoryId: string | null;
  subSubCategoryId: string | null;
  subSubSubCategoryId: string | null;
  brandId: string | null;
  isSubscription: boolean;
  frequency: string | null;
  lineType: 'SUBSCRIPTION' | 'ONE_TIME';
  promotionDiscount?: number;
  promotionOfferId?: string | null;
  /** Customer-facing offer copy for this variant. Display only — not a price change. */
  promotionalMessages?: string[];
};

export type CartCouponSummary = {
  id: string;
  code: string;
  title: string;
} | null;

export type CartCheckoutRules = {
  /** Admin `prepaid_discount_percent` — percent off product line totals for prepaid. */
  prepaidDiscountPercent: number;
  /** Admin `cod_min_order_amount` — min payable (subtotal − coupon) for COD. */
  codMinOrderAmount: number;
  /** Admin `cod_max_order_amount` — max payable (subtotal − coupon) for COD. */
  codMaxOrderAmount: number;
};

export type CartCodEligibility = {
  available: boolean;
  minimumOrderAmount: number;
  message: string;
  /** `COD_BLOCKED_FOR_PINCODE` | `COD_BLOCKED_FOR_CUSTOMER` when native checkout is blocked. */
  reasonCode?: string | null;
};

export type CartPromotionSummary = {
  id: string;
  name: string;
  offerType: string;
  customerMessage: string;
  discountAmount: number;
  code?: string | null;
};

export type CartCodeStatus =
  | 'applied'
  | 'ineligible'
  | 'expired'
  | 'disabled'
  | 'reward_unavailable'
  | 'usage_limit'
  | 'feature_disabled'
  | 'code_changed';

export type CartInvalidatedCode = {
  previousCode: string | null;
  status: CartCodeStatus;
  message: string;
  sourceType?: 'coupon' | 'promotional_offer';
};

export type CartAppliedCode = {
  code: string;
  sourceType: 'coupon' | 'promotional_offer';
  id: string;
  title: string;
};

export type CartPromotionWarning = {
  code: string;
  message: string;
};

export type CartRewardLine = {
  promotionOfferId: string;
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  variantLabel: string | null;
  quantity: number;
  catalogUnitPrice: number;
  chargedUnitPrice: number;
  totalPrice: number;
  promotionDiscount: number;
  primaryImageUrl?: IStorageFileReferenceResponse | null;
};

export type CartPricing = {
  subtotal: number;
  coupon: CartCouponSummary;
  discountAmount: number;
  shippingAmount: number;
  handlingAmount: number;
  platformFee: number;
  codCharge: number;
  /** Discount applied when paying with a prepaid method (subtracted from total). */
  prepaidDiscount: number;
  grandTotal: number;
  /** Display total of BMSM plus reward catalog savings. Not subtracted again on top of rewardCharged. */
  promotionDiscount?: number;
  bmsmDiscount?: number;
  rewardCharged?: number;
  promotions?: CartPromotionSummary[];
  promotionWarnings?: CartPromotionWarning[];
  rewardLines?: CartRewardLine[];
  lineAllocations?: Array<{ lineId: string; promotionOfferId: string; promotionDiscount: number }>;
  appliedCode?: CartAppliedCode | null;
  invalidatedCode?: CartInvalidatedCode | null;
  /** Live admin rules for FE (prepaid % + COD limits). */
  checkoutRules: CartCheckoutRules;
  /** Backend-computed COD availability for the current cart payable merchandise. */
  cod: CartCodEligibility;
};

export type CartResponse = {
  cartId: string;
  items: CartLineItem[];
  totalItems: number;
  /** Cart-value gift copy. Shown even when checkout does not apply the gift price. */
  promotionNotices?: string[];
} & CartPricing;

export type CheckoutLineItem = {
  cartItemId: string;
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  categoryId: string;
  subCategoryId: string | null;
  subSubCategoryId: string | null;
  subSubSubCategoryId: string | null;
  brandId: string | null;
  isSubscription: boolean;
  frequency: string | null;
  lineSource?: 'customer' | 'promotion';
  promotionOfferId?: string | null;
  catalogUnitPrice?: number | null;
  promotionDiscount?: number;
};

export type CheckoutSummary = {
  items: CheckoutLineItem[];
} & CartPricing;
