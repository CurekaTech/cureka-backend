import { ProductMediaType } from '../enums/product-media-type.enum';
import { ProductStatus } from '../enums/product-status.enum';
import { ProductType } from '../enums/product-type.enum';
import { mapProductsToBulkExportRows } from './bulk-upload-export.mapper';

const createdAt = new Date('2024-01-01T00:00:00.000Z');

const headers = [
  'Product Name*',
  'Product Type *',
  'Product SKU Code*',
  'Single Product URL',
  'Product Page URL',
  'Primary Image Filename',
  'Primary Image URL',
  'style_group_id',
];

const cell = (row: Array<string | number | null>, header: string) =>
  row[headers.indexOf(header)];

describe('mapProductsToBulkExportRows URLs and primary image', () => {
  it('exports a distinct live PDP URL per variable variant and falls back primary from common media', () => {
    const product = {
      refId: 'parent-ref',
      name: 'Knee Support',
      productType: ProductType.VARIABLE,
      status: ProductStatus.PUBLISHED,
      createdAt,
      singleProductUrl: 'https://www.cureka.com/shop/knee-support',
      slug: 'knee-support',
      category: { slug: 'pain-relief' },
      subCategory: { slug: 'knee-support' },
      variants: [
        {
          sku: 'KNEE-S',
          slug: 'knee-support-small',
          productPageUrl: '/shop/pain-relief/knee-support/knee-support-small',
          createdAt,
        },
        {
          sku: 'KNEE-M',
          slug: 'knee-support-medium',
          productPageUrl: null,
          createdAt: new Date('2024-01-02T00:00:00.000Z'),
        },
      ],
      media: [
        {
          type: ProductMediaType.COMMON,
          variantId: null,
          isPrimary: true,
          sortOrder: 0,
          url: { key: 'images/knee.png' },
        },
      ],
    } as any;

    const rows = mapProductsToBulkExportRows([product], headers, {
      skuLookup: new Map(),
      productById: new Map(),
      toExportMediaUrl: (key) => `https://cdn.example/${key}`,
    });

    expect(rows).toHaveLength(2);
    expect(cell(rows[0], 'Single Product URL')).toBe(
      'https://www.cureka.com/shop/knee-support',
    );
    expect(cell(rows[0], 'Product Page URL')).toBe(
      '/shop/pain-relief/knee-support/knee-support-small',
    );
    expect(cell(rows[1], 'Product Page URL')).toBe(
      '/shop/pain-relief/knee-support/knee-support-medium',
    );
    expect(cell(rows[1], 'Single Product URL')).toBe(
      'https://www.cureka.com/shop/knee-support',
    );
    expect(cell(rows[0], 'Primary Image URL')).toBe('https://cdn.example/images/knee.png');
    expect(cell(rows[1], 'Primary Image URL')).toBe('https://cdn.example/images/knee.png');
  });
});
