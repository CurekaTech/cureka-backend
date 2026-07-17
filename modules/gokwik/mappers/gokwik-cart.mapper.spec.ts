import { CartResponse } from '@modules/orders/interfaces/cart-pricing.interface';
import { mapCartToGokwikCart } from './gokwik-cart.mapper';

describe('mapCartToGokwikCart', () => {
  it('maps collection IDs, stock and backend totals without duplicate metadata fields', () => {
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

    const result = mapCartToGokwikCart(cart);

    expect(result.total).toBe(495);
    expect(result.items[0]).toMatchObject({
      collection_ids: ['category-1', 'category-2'],
      stock_status: 'IN_STOCK',
      salable_qty: 3,
      metaData: [{ label: 'Form', value: 'Tablet' }],
      metadata: {
        product_details: [{ label: 'Form', value: 'Tablet' }],
        pre_checkout_location: expect.objectContaining({ country: 'India' }),
      },
    });
    expect(result.discounts).toEqual([
      expect.objectContaining({ code: 'SAVE50', amount: 50 }),
    ]);
  });
});
