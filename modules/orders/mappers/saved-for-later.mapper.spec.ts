import 'reflect-metadata';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { evaluateSavedItemAvailability, mapSavedForLaterListItem } from './saved-for-later.mapper';

describe('saved-for-later mapper', () => {
  it('marks unpublished products as not movable', () => {
    const result = evaluateSavedItemAvailability(
      1,
      { status: ProductStatus.DRAFT } as never,
      { status: VariantStatus.ACTIVE, stock: 10 } as never,
    );
    expect(result.canMoveToCart).toBe(false);
    expect(result.unavailableReason).toBe('PRODUCT_INACTIVE');
  });

  it('marks missing products as deleted', () => {
    const result = evaluateSavedItemAvailability(1, null, { status: VariantStatus.ACTIVE, stock: 5 } as never);
    expect(result.unavailableReason).toBe('PRODUCT_DELETED');
    expect(result.canMoveToCart).toBe(false);
  });

  it('marks inactive variants as not movable', () => {
    const result = evaluateSavedItemAvailability(
      1,
      { status: ProductStatus.PUBLISHED } as never,
      { status: VariantStatus.INACTIVE, stock: 10 } as never,
    );
    expect(result.unavailableReason).toBe('VARIANT_INACTIVE');
  });

  it('maps current price fields from the live variant', () => {
    const item = mapSavedForLaterListItem(
      {
        id: 'sfl-1',
        productId: 'p-1',
        variantId: 'v-1',
        quantity: 2,
        isSubscription: false,
        frequency: null,
        createdAt: new Date('2026-09-08T10:00:00.000Z'),
        product: {
          name: 'Vitamin C',
          slug: 'vitamin-c',
          status: ProductStatus.PUBLISHED,
          brand: { name: 'Cureka' },
        },
        variant: {
          id: 'v-1',
          sku: 'SKU-1',
          sellingPrice: '499.00',
          mrp: '599.00',
          discountPercentage: '16.69',
          stock: 8,
          status: VariantStatus.ACTIVE,
          attributeValues: [],
        },
      } as never,
      null,
    );

    expect(item.product.title).toBe('Vitamin C');
    expect(item.product.brand).toBe('Cureka');
    expect(item.variant.currentPrice).toBe(499);
    expect(item.variant.originalPrice).toBe(599);
    expect(item.canMoveToCart).toBe(true);
    expect(item.unavailableReason).toBeNull();
  });
});
