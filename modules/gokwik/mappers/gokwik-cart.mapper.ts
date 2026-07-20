import { isVariantInStock, getSalableStockQuantity } from '@packages/common';
import { CartResponse } from '@modules/orders/interfaces/cart-pricing.interface';
import {
  GokwikCart,
  GokwikCartDiscount,
  GokwikCartItem,
  GokwikOrderSummaryExtraField,
} from '../interfaces/gokwik-cart.interface';

export type GokwikCartMappingOptions = {
  origin?: { city: string; state: string; pincode: string; country: string };
  shippingAddress?: { postalCode: string };
};

export function mapCartToGokwikCart(
  cart: CartResponse,
  options: GokwikCartMappingOptions = {},
): GokwikCart {
  const items: GokwikCartItem[] = cart.items.map((item) => {
    const productDetails = item.productDetails ?? [];
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
      metaData: productDetails,
      metadata: {
        pre_checkout_location: options.origin ?? {
          city: '',
          state: '',
          pincode: '',
          country: 'India',
        },
        ...(productDetails.length ? { product_details: productDetails } : {}),
        ...(options.shippingAddress
          ? {
              edd: buildStaticEdd(),
              try_and_buy: { enabled: false, instructions: '' },
              non_serviceable_message: inStock ? '' : 'This item is currently unavailable',
            }
          : {}),
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
    available_payment_methods: [],
    available_coupons: [],
    available_shipping_methods: [],
    order_summary_extra_fields: orderSummaryExtraFields,
  };
}

function buildStaticEdd() {
  const min = new Date();
  const max = new Date();
  min.setUTCDate(min.getUTCDate() + 3);
  max.setUTCDate(max.getUTCDate() + 7);
  const minDate = min.toISOString().slice(0, 10);
  const maxDate = max.toISOString().slice(0, 10);
  return {
    shipment_group: 1,
    default: { min_date: minDate, max_date: maxDate },
    by_shipping_method: [
      { shipping_id: 'standard', min_date: minDate, max_date: maxDate },
    ],
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
