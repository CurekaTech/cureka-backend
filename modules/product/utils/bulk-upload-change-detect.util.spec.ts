import { ProductStatus } from '../enums/product-status.enum';
import { ProductType } from '../enums/product-type.enum';
import { detectBulkUploadChanges } from './bulk-upload-change-detect.util';
import {
  mergeProductInformationByLabel,
  productInformationEquals,
} from './product-information.util';

describe('mergeProductInformationByLabel', () => {
  it('updates only the changed label and preserves others', () => {
    const merged = mergeProductInformationByLabel(
      [
        { id: '1', label: 'Description', description: 'Old desc', sortOrder: 1 },
        { id: '2', label: 'Key Benefits', description: 'Keep me', sortOrder: 2 },
      ],
      [{ label: 'Description', description: 'New desc' }],
    );

    expect(merged).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: '1', label: 'Description', description: 'New desc' }),
        expect.objectContaining({ id: '2', label: 'Key Benefits', description: 'Keep me' }),
      ]),
    );
  });

  it('preserves existing labels when the sheet cell is blank', () => {
    const merged = mergeProductInformationByLabel(
      [{ id: '1', label: 'Description', description: 'Keep', sortOrder: 1 }],
      [{ label: 'Description', description: '   ' }],
    );
    expect(productInformationEquals(merged, [
      { label: 'Description', description: 'Keep' },
    ])).toBe(true);
  });
});

describe('detectBulkUploadChanges', () => {
  const baseProduct = {
    id: 'p1',
    refId: 'prod-ref',
    name: 'Vitamin C',
    productType: ProductType.SIMPLE,
    status: ProductStatus.PUBLISHED,
    description: 'Desc',
    subscriptionEnabled: false,
    returnAllowed: true,
    codAvailable: true,
    emiAvailable: false,
    replaceAllowed: false,
    brand: { refId: 'brand-1', name: 'Brand' },
    category: { refId: 'cat-1', name: 'Cat' },
    productInformation: [
      { id: '1', label: 'Description', description: 'Desc', sortOrder: 1 },
    ],
    variants: [
      {
        id: 'v1',
        sku: 'SKU-1',
        mrp: '100.00',
        sellingPrice: '90.00',
        stock: 5,
        outOfStock: false,
        inCurekaInventory: true,
        productPageUrl: '/shop/old',
        attributeValues: [],
        productInformation: [],
      },
    ],
    attributeMappings: [],
    categoryFilterMappings: [],
    healthConcernMappings: [],
    wellnessGoalMappings: [],
    tagMappings: [],
  } as any;

  it('skips when the uploaded payload matches the database', () => {
    const result = detectBulkUploadChanges(baseProduct, {
      name: 'Vitamin C',
      productType: ProductType.SIMPLE,
      brandRefId: 'brand-1',
      categoryRefId: 'cat-1',
      description: 'Desc',
      subscriptionEnabled: false,
      returnAllowed: true,
      codAvailable: true,
      emiAvailable: false,
      replaceAllowed: false,
      productInformation: [
        { label: 'Description', description: 'Desc' },
      ],
      variants: [
        {
          sku: 'SKU-1',
          mrp: 100,
          sellingPrice: 90,
          stock: 5,
          outOfStock: false,
          inCurekaInventory: true,
          productPageUrl: '/shop/old',
          attributes: [],
        },
      ],
    });

    expect(result.skip).toBe(true);
  });

  it('updates only Product Page URL when that field changes', () => {
    const result = detectBulkUploadChanges(baseProduct, {
      name: 'Vitamin C',
      variants: [
        {
          sku: 'SKU-1',
          mrp: 100,
          sellingPrice: 90,
          stock: 5,
          productPageUrl: '/shop/new',
          attributes: [],
        },
      ],
    });

    expect(result.skip).toBe(false);
    if (result.skip) return;
    expect(result.hasVariantPatches).toBe(true);
    expect(result.sparseDto.variants).toHaveLength(1);
    expect(result.sparseDto.variants?.[0]).toEqual(
      expect.objectContaining({
        sku: 'SKU-1',
        productPageUrl: '/shop/new',
      }),
    );
    expect(result.sparseDto.variants?.[0]?.mrp).toBeUndefined();
    expect(result.sparseDto.name).toBeUndefined();
  });

  it('updates only one product-information label', () => {
    const result = detectBulkUploadChanges(baseProduct, {
      productInformation: [
        { label: 'Description', description: 'Changed' },
      ],
    });

    expect(result.skip).toBe(false);
    if (result.skip) return;
    expect(result.sparseDto.productInformation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Description', description: 'Changed' }),
      ]),
    );
    expect(result.sparseDto.variants).toBeUndefined();
  });
});
