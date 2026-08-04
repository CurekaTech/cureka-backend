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
      price: toGokwikAmount(item.unitPrice),
      mrp: toGokwikAmount(mrp),
      total: toGokwikAmount(item.totalPrice),
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

  const discountAmount = toGokwikAmount(cart.discountAmount);
  const discounts: GokwikCartDiscount[] =
    cart.coupon && discountAmount > 0
      ? [
          {
            amount: discountAmount,
            code: cart.coupon.code,
            description: cart.coupon.title || cart.coupon.code,
            type: 'CART_DISCOUNT',
            tnc: '',
          },
        ]
      : [];

  const handling = toGokwikAmount(cart.handlingAmount);
  const platform = toGokwikAmount(cart.platformFee);
  const cod = toGokwikAmount(cart.codCharge);
  const prepaid = toGokwikAmount(cart.prepaidDiscount);
  const subtotal = toGokwikAmount(cart.subtotal);
  const shippingTotal = toGokwikAmount(cart.shippingAmount);
  const orderSummaryExtraFields = buildOrderSummaryExtraFields({
    handling,
    platform,
    cod,
    prepaid,
  });

  // Keep GoKwik total aligned with summary lines + extra fields.
  const total = Math.max(
    0,
    subtotal - discountAmount + shippingTotal + handling + platform + cod - prepaid,
  );

  return {
    subtotal,
    discount_total: discountAmount,
    shipping_total: shippingTotal,
    total,
    currency: 'INR',
    items,
    discounts,
    wallet_credit_used: 0,
    membership_discount: 0,
    cashback_amount: 0,
    total_tax: 0,
    available_payment_methods: options.availablePaymentMethods ?? [],
    available_coupons: [],
    available_shipping_methods: (
      options.availableShippingMethods ?? GOKWIK_DEFAULT_SHIPPING_METHODS
    ).map((method) => ({
      ...method,
      price: toGokwikAmount(method.price),
    })),
    order_summary_extra_fields: orderSummaryExtraFields,
  };
}

/**
 * Mirror cart pricing into GoKwik `order_summary_extra_fields`.
 * Handling + Platform are always included (including 0 → shown as FREE).
 * Labels match the storefront bill summary.
 * Values must be integers (GoKwik schema).
 */
function buildOrderSummaryExtraFields(fees: {
  handling: number;
  platform: number;
  cod: number;
  prepaid: number;
}): GokwikOrderSummaryExtraField[] {
  const fields: GokwikOrderSummaryExtraField[] = [
    { name: 'Handling charges', value: fees.handling },
    { name: 'Platform fee', value: fees.platform },
  ];

  if (fees.cod > 0) {
    fields.push({ name: 'COD Charge', value: fees.cod });
  }
  if (fees.prepaid > 0) {
    fields.push({ name: 'Prepaid Discount', value: -fees.prepaid });
  }

  return fields;
}

/** GoKwik money fields are documented as integers (rupees). */
function toGokwikAmount(value: number | null | undefined): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount);
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
