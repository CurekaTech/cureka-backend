import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import {
  formatUnicommerceSize,
  mapProductToItemTypes,
  mapVariantsToChannelItemTypes,
} from './unicommerce-product.mapper';

describe('unicommerce-product.mapper', () => {
  it('formats variant dimensions in millimeters', () => {
    const variant = {
      length: '10',
      lengthUnit: 'cm',
      width: '5',
      widthUnit: 'cm',
      height: '2',
      heightUnit: 'cm',
    } as ProductVariantEntity;

    expect(formatUnicommerceSize(variant)).toBe('100.00X50.00X20.00');
  });
});

describe('mapProductToItemTypes', () => {
  const baseVariant = {
    id: 'variant-1',
    sku: 'VIT-C-30ML',
    slug: 'vitamin-c-serum-30ml',
    sellingPrice: '499.00',
    mrp: '699.00',
    stock: 25,
    hsnCode: '30049099',
    weight: '100',
    weightUnit: 'gm',
    length: '60',
    width: '40',
    height: '20',
    lengthUnit: 'mm',
    widthUnit: 'mm',
    heightUnit: 'mm',
    status: VariantStatus.ACTIVE,
    deletedAt: undefined,
    attributeValues: [],
    searchTags: ['vitamin-c', 'serum'],
  };

  const product = {
    refId: 'PRD-001',
    name: 'Vitamin C Serum',
    publishedAt: new Date(),
    createdAt: new Date(),
    brand: { name: 'Cureka Labs' },
    media: [],
    variants: [baseVariant],
  } as unknown as ProductEntity;

  it('maps a product variant to the official itemTypes format', () => {
    const items = mapProductToItemTypes(product, {
      imageUrlByMediaId: new Map(),
      categoryCode: 'PHARMA',
      defaultHsnCode: '30049099',
      productBaseUrl: 'https://cureka.com/products',
    });

    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item.skuCode).toBe('VIT-C-30ML');
    expect(item.name).toBe('Vitamin C Serum');
    expect(item.categoryCode).toBe('PHARMA');
    expect(item.brand).toBe('Cureka Labs');
    expect(item.hsnCode).toBe('30049099');
    expect(item.maxRetailPrice).toBe(699);
    expect(item.basePrice).toBe(499);
    expect(item.type).toBe('SIMPLE');
    expect(item.enabled).toBe(true);
    expect(item.productPageUrl).toBe('https://cureka.com/products/vitamin-c-serum-30ml');
    expect(item.weight).toBe(100);
  });

  it('returns empty array when no active variants', () => {
    const inactiveProduct = {
      ...product,
      variants: [{ ...baseVariant, status: VariantStatus.INACTIVE }],
    } as unknown as ProductEntity;
    expect(mapProductToItemTypes(inactiveProduct, { imageUrlByMediaId: new Map() })).toHaveLength(0);
  });
});

describe('mapVariantsToChannelItemTypes', () => {
  it('maps active variants to CUSTOM channel data', () => {
    const variant = {
      id: 'v1',
      sku: 'SKU-001',
      sellingPrice: '499.00',
      mrp: '699.00',
      status: VariantStatus.ACTIVE,
      deletedAt: undefined,
    };
    const product = {
      variants: [variant],
    } as unknown as ProductEntity;

    const result = mapVariantsToChannelItemTypes(product, 'CUSTOM');
    expect(result).toHaveLength(1);
    expect(result[0].channelCode).toBe('CUSTOM');
    expect(result[0].skuCode).toBe('SKU-001');
    expect(result[0].channelProductId).toBe('SKU-001');
    expect(result[0].sellerSkuCode).toBe('SKU-001');
    expect(result[0].live).toBe(true);
    expect(result[0].verified).toBe(true);
  });
});
