import { ProductType } from '@modules/product/enums/product-type.enum';
import { IPublicProductCard, IPublicProductDetail } from '../interfaces/public-product.interface';
import { toPublicStorefrontProductCard, toPublicStorefrontProductDetail } from './public-product.mapper';

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

describe('toPublicStorefrontProductDetail', () => {
  it('drops unused PDP fields and variant status/images', () => {
    const detail = {
      id: 'prod-uuid',
      refId: 'PRD1',
      name: 'Omega-3',
      slug: 'omega-3',
      selectedVariantId: 'var-uuid',
      selectedVariantSlug: 'omega-3-500',
      productType: ProductType.VARIABLE,
      productNatureRefId: 'NAT1',
      productNatureName: 'Capsule',
      categoryRefId: 'CAT1',
      categoryName: 'Supplements',
      subCategoryRefId: 'CAT2',
      subCategoryName: 'Omega',
      subSubCategoryRefId: null,
      subSubCategoryName: null,
      subSubSubCategoryRefId: null,
      subSubSubCategoryName: null,
      categories: [],
      categorySlugPath: ['supplements', 'omega'],
      permalink: '/shop/supplements/omega/omega-3',
      brandRefId: 'BRD1',
      brandName: 'Cureka',
      brandSlug: 'cureka',
      manufacturerRefId: 'MFG1',
      manufacturerName: 'Acme',
      manufacturerAddress: 'Chennai',
      packerRefId: null,
      packerName: null,
      packerAddress: null,
      importerRefId: null,
      importerName: null,
      importerAddress: null,
      manufacturer: { refId: 'MFG1', name: 'Acme', email: 'hidden@acme.test' },
      countryOfOriginRefId: 'IN',
      countryOfOriginName: 'India',
      description: 'Fish oil',
      components: 'EPA',
      productInformation: [{ id: '1', label: 'Highlights', description: 'Omega-3', sortOrder: 1 }],
      expiresInMonths: 12,
      subscriptionEnabled: true,
      codAvailable: true,
      emiAvailable: false,
      replaceAllowed: true,
      replaceWindowDays: 7,
      returnAllowed: true,
      returnPolicy: '7 days',
      returnWindowDays: 7,
      metaTitle: 'Omega-3',
      metaDescription: 'Buy omega-3',
      metaKeywords: ['omega'],
      publishedAt: new Date('2026-01-01'),
      sizeChart: null,
      pricing: {
        minSellingPrice: 799,
        maxSellingPrice: 999,
        minMrp: 999,
        maxDiscountPercentage: 20,
        inStock: true,
      },
      isFreeDelivery: true,
      codMinOrderAmount: 500,
      attributes: [{ refId: 'ATTR1', name: 'Pack' }],
      variants: [
        {
          id: 'var-uuid',
          sku: 'SKU1',
          slug: 'omega-3-500',
          productPageUrl: '/shop/omega-3/',
          displayName: '500mg',
          status: 'active',
          images: [{ id: 'img1' }],
          mrp: 999,
          sellingPrice: 799,
          discountPercentage: 20,
          stock: 10,
          inStock: true,
          outOfStock: false,
          estimatedDeliveryTime: '3-5 Days',
          subscriptionEnabled: true,
          returnAllowed: true,
          returnPolicy: '7 days',
          returnWindowDays: 7,
          replaceAllowed: true,
          replaceWindowDays: 7,
          weight: 100,
          weightUnit: 'g',
          length: null,
          lengthUnit: null,
          width: null,
          widthUnit: null,
          height: null,
          heightUnit: null,
          expiryDate: '01-01-2027',
          attributes: [{ attributeRefId: 'ATTR1', attributeName: 'Pack', value: 'Pack of 1' }],
        },
      ],
      media: [],
      healthConcerns: [{ refId: 'HC1', name: 'Heart', slug: 'heart' }],
      wellnessGoals: [{ refId: 'WG1', name: 'Immunity', image: null }],
      categoryFilters: [],
      tags: [{ refId: 'TAG1', name: 'Bestsellers', slug: 'bestsellers' }],
      faqs: [{ refId: 'FAQ1', question: 'Q', answer: 'A', sequence: 0 }],
      bundleItems: [],
      banners: [{ refId: 'BAN1', title: 'Promo', imageUrl: { key: 'b.jpg', name: 'bucket', url: 'https://x' }, ctaHref: '/shop' }],
    } as unknown as IPublicProductDetail;

    const slim = toPublicStorefrontProductDetail(detail);

    expect(slim.refId).toBe('PRD1');
    expect(slim.selectedVariantId).toBe('var-uuid');
    expect(slim.variants[0]?.sku).toBe('SKU1');
    expect(slim.variants[0]?.attributes[0]).toEqual({
      attributeRefId: 'ATTR1',
      attributeName: 'Pack',
      value: 'Pack of 1',
    });
    expect(slim).not.toHaveProperty('productType');
    expect(slim).not.toHaveProperty('productNatureRefId');
    expect(slim).not.toHaveProperty('categoryRefId');
    expect(slim).not.toHaveProperty('brandRefId');
    expect(slim).not.toHaveProperty('manufacturerRefId');
    expect(slim).not.toHaveProperty('manufacturer');
    expect(slim).not.toHaveProperty('wellnessGoals');
    expect(slim).not.toHaveProperty('tags');
    expect(slim).not.toHaveProperty('bundleItems');
    expect(slim).not.toHaveProperty('publishedAt');
    expect(slim).not.toHaveProperty('metaKeywords');
    expect(slim).not.toHaveProperty('selectedVariantSlug');
    expect(slim.variants[0]).not.toHaveProperty('status');
    expect(slim.variants[0]).not.toHaveProperty('images');
    expect(slim.banners[0]).not.toHaveProperty('placement');
  });
});
