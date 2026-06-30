import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import {
  formatUnicommerceSize,
  mapProductToUnicommerceCatalog,
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

  it('maps published product variants to Unicommerce catalog shape', () => {
    const product = {
      refId: 'PRD-001',
      name: 'Vitamin C Serum',
      publishedAt: new Date('2026-01-02T08:12:53.000Z'),
      createdAt: new Date('2026-01-01T08:12:53.000Z'),
      brand: { name: 'Cureka Labs' },
      media: [],
      variants: [
        {
          id: 'variant-1',
          sku: 'VIT-C-30ML',
          slug: 'vitamin-c-serum-30ml',
          sellingPrice: '499.00',
          mrp: '699.00',
          stock: 25,
          length: '60',
          width: '40',
          height: '20',
          lengthUnit: 'mm',
          widthUnit: 'mm',
          heightUnit: 'mm',
          status: VariantStatus.ACTIVE,
          deletedAt: undefined,
          attributeValues: [],
        },
      ],
    } as unknown as ProductEntity;

    const mapped = mapProductToUnicommerceCatalog(product, {
      imageUrlByMediaId: new Map(),
      productBaseUrl: 'https://cureka.com/product',
    });

    expect(mapped).toEqual({
      id: 'PRD-001',
      parentTitle: 'Vitamin C Serum',
      brand: 'Cureka Labs',
      created: '2026-01-02T08:12:53.000Z',
      variants: [
        {
          imageUrl: undefined,
          productUrl: 'https://cureka.com/product/vitamin-c-serum-30ml',
          variantId: 'VIT-C-30ML',
          title: 'Vitamin C Serum',
          sku: 'VIT-C-30ML',
          size: '60.00X40.00X20.00',
          color: undefined,
          live: true,
          itemPrice: {
            currency: 'INR',
            listingPrice: 499,
            mrp: 699,
          },
          inventory: 25,
        },
      ],
    });
  });

  it('returns null when product has no active variants', () => {
    const product = {
      refId: 'PRD-002',
      name: 'Draft Serum',
      brand: { name: 'Cureka' },
      media: [],
      variants: [
        {
          id: 'variant-1',
          sku: 'DRAFT-SKU',
          status: VariantStatus.INACTIVE,
          deletedAt: undefined,
        },
      ],
    } as unknown as ProductEntity;

    expect(
      mapProductToUnicommerceCatalog(product, {
        imageUrlByMediaId: new Map(),
      }),
    ).toBeNull();
  });
});
