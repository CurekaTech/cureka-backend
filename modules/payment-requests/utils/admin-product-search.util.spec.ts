import { ProductType } from '@modules/product/enums/product-type.enum';
import {
  buildBundleCodMap,
  groupAdminProductSearchVariants,
} from './admin-product-search.util';

describe('groupAdminProductSearchVariants', () => {
  it('exposes website product COD on the product and each variant', () => {
    const result = groupAdminProductSearchVariants([
      {
        variantId: 'v1',
        productId: 'p1',
        productName: 'Cough syrup',
        productType: ProductType.SIMPLE,
        productCodAvailable: false,
        sku: 'CSK/001',
        mrp: '100.00',
        sellingPrice: '90.00',
        stock: 4,
        attributeLabel: null,
        variantCodAvailable: true,
      },
    ]);

    expect(result).toEqual([
      {
        productId: 'p1',
        productName: 'Cough syrup',
        codAvailable: false,
        variants: [
          {
            variantId: 'v1',
            sku: 'CSK/001',
            mrp: '100.00',
            sellingPrice: '90.00',
            stock: 4,
            attributeLabel: null,
            codAvailable: false,
          },
        ],
      },
    ]);
  });

  it('marks COD when the product toggle is on', () => {
    const [product] = groupAdminProductSearchVariants([
      {
        variantId: 'v1',
        productId: 'p1',
        productName: 'Vitamin C',
        productType: ProductType.SIMPLE,
        productCodAvailable: true,
        sku: 'VIT/C',
        mrp: '200.00',
        sellingPrice: '180.00',
        stock: 8,
        attributeLabel: null,
        variantCodAvailable: true,
      },
    ]);

    expect(product.codAvailable).toBe(true);
    expect(product.variants[0].codAvailable).toBe(true);
  });

  it('derives bundle COD from every child variant', () => {
    const bundleCod = buildBundleCodMap(
      ['bundle-1'],
      [
        { parentProductId: 'bundle-1', childVariant: { codAvailable: true } },
        { parentProductId: 'bundle-1', childVariant: { codAvailable: false } },
      ],
    );
    const [product] = groupAdminProductSearchVariants(
      [
        {
          variantId: 'bv1',
          productId: 'bundle-1',
          productName: 'Immunity kit',
          productType: ProductType.BUNDLE,
          productCodAvailable: true,
          sku: 'BND/001',
          mrp: '500.00',
          sellingPrice: '450.00',
          stock: 2,
          attributeLabel: null,
          variantCodAvailable: true,
        },
      ],
      bundleCod,
    );

    expect(product.codAvailable).toBe(false);
    expect(product.variants[0].codAvailable).toBe(false);
  });
});
