import { IStorageFileReferenceResponse } from '@packages/storage';

export type CartLineItemProductDetail = {
  label: string;
  value: string;
};

export type CartLineItem = {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
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
  /** Live admin rules for FE (prepaid % + COD limits). */
  checkoutRules: CartCheckoutRules;
};

export type CartResponse = {
  cartId: string;
  items: CartLineItem[];
  totalItems: number;
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
};

export type CheckoutSummary = {
  items: CheckoutLineItem[];
} & CartPricing;
