import { CartResponse } from '@modules/orders/interfaces/cart-pricing.interface';
import { mapCartToGokwikCart } from './gokwik-cart.mapper';

describe('mapCartToGokwikCart', () => {
  it('maps collection IDs, stock and backend totals with simplified metadata', () => {
    const cart: CartResponse = {
      cartId: 'cart-1',
      totalItems: 2,
      subtotal: 500,
      discountAmount: 50,
      shippingAmount: 45,
      handlingAmount: 0,
      platformFee: 0,
      codCharge: 0,
      prepaidDiscount: 0,
      grandTotal: 495,
      checkoutRules: {
        prepaidDiscountPercent: 2,
        codMinOrderAmount: 599,
        codMaxOrderAmount: 10000,
      },
      coupon: { id: 'coupon-1', code: 'SAVE50', title: 'Save 50' },
      items: [
        {
          id: 'line-1',
          productId: 'product-1',
          variantId: 'variant-1',
          productName: 'Test Product',
          sku: 'SKU-1',
          variantLabel: null,
          quantity: 2,
          unitPrice: 250,
          mrp: 300,
          totalPrice: 500,
          stock: 3,
          inStock: true,
          isAvailable: true,
          primaryImageUrl: null,
          productDetails: [{ label: 'Form', value: 'Tablet' }],
          categoryId: 'category-1',
          subCategoryId: 'category-2',
          subSubCategoryId: null,
          subSubSubCategoryId: null,
          brandId: 'brand-1',
        },
      ],
    };

    const result = mapCartToGokwikCart(cart, {
      availablePaymentMethods: [
        { id: 'prepaid', title: 'Prepaid', price: 0, currency: 'INR' },
        { id: 'cod', title: 'Cash on Delivery', price: 50, currency: 'INR' },
      ],
      availableShippingMethods: [
        { id: 'shipping', price: 45, title: 'Shipping', currency: 'INR' },
      ],
    });

    expect(result.total).toBe(495);
    expect(result.items[0]).toMatchObject({
      collection_ids: ['category-1', 'category-2'],
      stock_status: 'IN_STOCK',
      salable_qty: 3,
      metadata: {
        product_details: [{ label: 'Form', value: 'Tablet' }],
      },
    });
    expect(result.items[0].metadata).toEqual({
      product_details: [{ label: 'Form', value: 'Tablet' }],
    });
    expect(result.discounts).toEqual([
      expect.objectContaining({ code: 'SAVE50', amount: 50 }),
    ]);
    expect(result.available_payment_methods).toEqual([
      { id: 'prepaid', title: 'Prepaid', price: 0, currency: 'INR' },
      { id: 'cod', title: 'Cash on Delivery', price: 50, currency: 'INR' },
    ]);
    expect(result.available_shipping_methods).toEqual([
      {
        id: 'shipping',
        price: 45,
        title: 'Shipping',
        currency: 'INR',
      },
    ]);
  });

  it('falls back to variant label when product details are missing', () => {
    const cart: CartResponse = {
      cartId: 'cart-2',
      totalItems: 1,
      subtotal: 250,
      discountAmount: 0,
      shippingAmount: 0,
      handlingAmount: 0,
      platformFee: 0,
      codCharge: 0,
      prepaidDiscount: 0,
      grandTotal: 250,
      checkoutRules: {
        prepaidDiscountPercent: 2,
        codMinOrderAmount: 599,
        codMaxOrderAmount: 10000,
      },
      coupon: null,
      items: [
        {
          id: 'line-2',
          productId: 'product-2',
          variantId: 'variant-2',
          productName: 'Fallback Product',
          sku: 'SKU-2',
          variantLabel: 'Size: 30 Tabs · Pack Size: 2',
          quantity: 1,
          unitPrice: 250,
          mrp: 250,
          totalPrice: 250,
          stock: 10,
          inStock: true,
          isAvailable: true,
          primaryImageUrl: null,
          productDetails: [],
          categoryId: 'category-1',
          subCategoryId: null,
          subSubCategoryId: null,
          subSubSubCategoryId: null,
          brandId: 'brand-1',
        },
      ],
    };

    const result = mapCartToGokwikCart(cart);

    expect(result.items[0].metadata.product_details).toEqual([
      { label: 'Size', value: '30 Tabs' },
      { label: 'Pack Size', value: '2' },
    ]);
  });
});
