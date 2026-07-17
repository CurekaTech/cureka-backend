import { CartResponse } from '@modules/orders/interfaces/cart-pricing.interface';
import {
  GokwikCart,
  GokwikCartDiscount,
  GokwikCartItem,
  GokwikOrderSummaryExtraField,
} from '../interfaces/gokwik-cart.interface';

export function mapCartToGokwikCart(cart: CartResponse): GokwikCart {
  const items: GokwikCartItem[] = cart.items.map((item) => {
    const productDetails = item.productDetails ?? [];
    const inStock = item.isAvailable && item.stock > 0;
    const mrp = item.mrp != null && Number.isFinite(item.mrp) ? item.mrp : item.unitPrice;

    return {
      product_id: item.productId,
      variant_id: item.variantId,
      sku: item.sku,
      price: item.unitPrice,
      mrp,
      total: item.totalPrice,
      quantity: item.quantity,
      title: item.productName,
      image_url: item.primaryImageUrl?.url ?? '',
      salable_qty: item.stock,
      stock_status: inStock ? 'IN_STOCK' : 'OUT_OF_STOCK',
      metaData: productDetails,
      ...(productDetails.length
        ? { metadata: { product_details: productDetails } }
        : {}),
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
    ...(orderSummaryExtraFields.length
      ? { order_summary_extra_fields: orderSummaryExtraFields }
      : {}),
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
  if (cart.prepaidDiscount > 0) {
    fields.push({ name: 'Prepaid Discount', value: -cart.prepaidDiscount });
  }

  return fields;
}
