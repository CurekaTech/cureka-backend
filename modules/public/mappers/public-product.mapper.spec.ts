import { ProductType } from '@modules/product/enums/product-type.enum';
import { IPublicProductCard } from '../interfaces/public-product.interface';
import { toPublicStorefrontProductCard } from './public-product.mapper';

describe('toPublicStorefrontProductCard', () => {
  const fullCard: IPublicProductCard = {
    id: 'prod-uuid',
    refId: 'PRD20260001',
    name: 'Omega-3 Capsules',
    slug: 'omega-3-capsules',
    productType: ProductType.SIMPLE,
    defaultVariantId: 'var-uuid',
    categoryRefId: 'CAT001',
    categoryName: 'Supplements',
    subCategoryRefId: 'CAT002',
    subCategoryName: 'Omega',
    categorySlugPath: ['supplements', 'omega'],
    permalink: '/shop/supplements/omega/omega-3-capsules',
    productPageUrl: '/shop/supplements/omega/omega-3-capsules/',
    brandRefId: 'BRD001',
    brandName: 'Cureka',
    brandSlug: 'cureka',
    productNatureRefId: 'NAT001',
    productNatureName: 'Capsule',
    primaryImageUrl: { key: 'products/omega.jpg', name: 'cureka-media' },
    pricing: { mrp: 999, sellingPrice: 799, inStock: true, discount: 20 },
    outOfStock: false,
    isBestSeller: true,
    isTop: true,
    subscriptionEnabled: true,
    codAvailable: true,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    tags: [{ refId: 'TAG001', name: 'Bestsellers', slug: 'bestsellers' }],
    variantId: 'var-uuid',
  };

  it('keeps storefront card fields and drops unused list-card fields', () => {
    const slim = toPublicStorefrontProductCard(fullCard);

    expect(slim).toEqual({
      id: 'prod-uuid',
      name: 'Omega-3 Capsules',
      slug: 'omega-3-capsules',
      defaultVariantId: 'var-uuid',
      variantId: 'var-uuid',
      primaryImageUrl: { key: 'products/omega.jpg', name: 'cureka-media' },
      pricing: { mrp: 999, sellingPrice: 799, inStock: true, discount: 20 },
      outOfStock: false,
      isBestSeller: true,
      productPageUrl: '/shop/supplements/omega/omega-3-capsules/',
      permalink: '/shop/supplements/omega/omega-3-capsules',
      categorySlugPath: ['supplements', 'omega'],
      brandName: 'Cureka',
      categoryName: 'Supplements',
      subCategoryName: 'Omega',
      tags: [{ name: 'Bestsellers' }],
    });

    expect(slim).not.toHaveProperty('refId');
    expect(slim).not.toHaveProperty('productType');
    expect(slim).not.toHaveProperty('categoryRefId');
    expect(slim).not.toHaveProperty('subCategoryRefId');
    expect(slim).not.toHaveProperty('brandRefId');
    expect(slim).not.toHaveProperty('brandSlug');
    expect(slim).not.toHaveProperty('productNatureRefId');
    expect(slim).not.toHaveProperty('productNatureName');
    expect(slim).not.toHaveProperty('isTop');
    expect(slim).not.toHaveProperty('subscriptionEnabled');
    expect(slim).not.toHaveProperty('codAvailable');
    expect(slim).not.toHaveProperty('publishedAt');
    expect(slim.tags[0]).not.toHaveProperty('refId');
    expect(slim.tags[0]).not.toHaveProperty('slug');
  });
});
