import { isVariantInStock, getSalableStockQuantity } from '@packages/common';
import { CartResponse } from '@modules/orders/interfaces/cart-pricing.interface';
import {
  GokwikAvailablePaymentMethod,
  GokwikAvailableShippingMethod,
  GokwikCart,
  GokwikCartDiscount,
  GokwikCartItem,
  GokwikOrderSummaryExtraField,
} from '../interfaces/gokwik-cart.interface';

export const GOKWIK_DEFAULT_SHIPPING_METHODS: GokwikAvailableShippingMethod[] = [
  {
    id: 'express_shipping',
    price: 100,
    title: 'Express Delivery',
    currency: 'INR',
  },
  {
    id: 'free_shipping',
    price: 0,
    title: 'Free Shipping',
    currency: 'INR',
  },
];

export type GokwikCartMappingOptions = {
  shippingAddress?: { postalCode: string };
  availablePaymentMethods?: GokwikAvailablePaymentMethod[];
  availableShippingMethods?: GokwikAvailableShippingMethod[];
};

export function mapCartToGokwikCart(
  cart: CartResponse,
  options: GokwikCartMappingOptions = {},
): GokwikCart {
  const items: GokwikCartItem[] = cart.items.map((item) => {
    const productDetails = resolveProductDetails(item);
    const inStock = item.inStock ?? (item.isAvailable && isVariantInStock(item.stock));
    const mrp = item.mrp != null && Number.isFinite(item.mrp) ? item.mrp : item.unitPrice;

    return {
      product_id: item.productId,
      variant_id: item.variantId,
      collection_ids: [
        item.categoryId,
        item.subCategoryId,
        item.subSubCategoryId,
        item.subSubSubCategoryId,
      ].filter((id): id is string => Boolean(id)),
      sku: item.sku,
      price: item.unitPrice,
      mrp,
      total: item.totalPrice,
      quantity: item.quantity,
      title: item.productName,
      image_url: item.primaryImageUrl?.url ?? '',
      salable_qty: getSalableStockQuantity(item.stock, item.quantity),
      stock_status: inStock ? 'IN_STOCK' : 'OUT_OF_STOCK',
      ...(options.shippingAddress ? { serviceable_status: inStock } : {}),
      metadata: {
        product_details: productDetails,
      },
    };
  });

  const discounts: GokwikCartDiscount[] =
    cart.coupon && cart.discountAmount > 0
      ? [
          {
            amount: cart.discountAmount,
            code: cart.coupon.code,
            description: cart.coupon.title || cart.coupon.code,
            type: 'CART_DISCOUNT',
            tnc: '',
          },
        ]
      : [];

  const orderSummaryExtraFields = buildOrderSummaryExtraFields(cart);

  return {
    subtotal: cart.subtotal,
    discount_total: cart.discountAmount,
    shipping_total: cart.shippingAmount,
    total: cart.grandTotal,
    currency: 'INR',
    items,
    discounts,
    wallet_credit_used: 0,
    membership_discount: 0,
    cashback_amount: 0,
    total_tax: 0,
    available_payment_methods: options.availablePaymentMethods ?? [],
    available_coupons: [],
    available_shipping_methods:
      options.availableShippingMethods ?? GOKWIK_DEFAULT_SHIPPING_METHODS,
    order_summary_extra_fields: orderSummaryExtraFields,
  };
}

function buildOrderSummaryExtraFields(cart: CartResponse): GokwikOrderSummaryExtraField[] {
  const fields: GokwikOrderSummaryExtraField[] = [];

  if (cart.handlingAmount > 0) {
    fields.push({ name: 'Handling Fee', value: cart.handlingAmount });
  }
  if (cart.platformFee > 0) {
    fields.push({ name: 'Platform Fee', value: cart.platformFee });
  }
  if (cart.codCharge > 0) {
    fields.push({ name: 'COD Charge', value: cart.codCharge });
  }
  if (cart.prepaidDiscount > 0) {
    fields.push({ name: 'Prepaid Discount', value: -cart.prepaidDiscount });
  }

  return fields;
}

function resolveProductDetails(item: CartResponse['items'][number]) {
  const fromAttributes = (item.productDetails ?? []).filter(
    (detail) => detail.label?.trim() && detail.value?.trim(),
  );
  if (fromAttributes.length) {
    return fromAttributes;
  }

  const fallback = parseVariantLabel(item.variantLabel);
  if (fallback.length) {
    return fallback;
  }

  return item.sku?.trim() ? [{ label: 'SKU', value: item.sku.trim() }] : [];
}

function parseVariantLabel(label: string | null): Array<{ label: string; value: string }> {
  if (!label?.trim()) {
    return [];
  }

  return label
    .split('·')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf(':');
      if (separatorIndex > 0) {
        return {
          label: part.slice(0, separatorIndex).trim(),
          value: part.slice(separatorIndex + 1).trim(),
        };
      }
      return { label: 'Variant', value: part };
    })
    .filter((detail) => detail.label && detail.value);
}
