import { IStorageFileReferenceResponse } from '@packages/storage';

export type CartLineItem = {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  sku: string;
  variantLabel: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  stock: number;
  isAvailable: boolean;
  primaryImageUrl: IStorageFileReferenceResponse | null;
  categoryId: string;
  subCategoryId: string | null;
  subSubCategoryId: string | null;
  subSubSubCategoryId: string | null;
  brandId: string | null;
};

export type CartCouponSummary = {
  id: string;
  code: string;
  title: string;
} | null;

export type CartPricing = {
  subtotal: number;
  coupon: CartCouponSummary;
  discountAmount: number;
  shippingAmount: number;
  handlingAmount: number;
  grandTotal: number;
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
};

export type CheckoutSummary = {
  items: CheckoutLineItem[];
} & CartPricing;
