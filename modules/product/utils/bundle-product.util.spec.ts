import {
  AUTO_SKU_PLACEHOLDER,
  ensureBundleSkuInPayload,
  ensureVariantSkusInPayload,
} from './bundle-product.util';

describe('bundle-product.util', () => {
  it('fills missing non-bundle variant skus with placeholder', () => {
    const payload = ensureVariantSkusInPayload({
      productType: 'variable',
      variants: [
        { sku: '', mrp: 100, sellingPrice: 90, stock: 5 },
        { mrp: 200, sellingPrice: 180, stock: 3 },
        { sku: 'EXISTING-1', mrp: 300, sellingPrice: 250, stock: 2 },
      ],
    });

    expect(payload).toMatchObject({
      variants: [
        { sku: AUTO_SKU_PLACEHOLDER },
        { sku: AUTO_SKU_PLACEHOLDER },
        { sku: 'EXISTING-1' },
      ],
    });
  });

  it('fills missing bundle sku with placeholder', () => {
    const payload = ensureBundleSkuInPayload({
      productType: 'bundle',
      variants: [{ mrp: 100, sellingPrice: 90, stock: 1 }],
    });

    expect(payload).toMatchObject({
      sku: AUTO_SKU_PLACEHOLDER,
      variants: [{ sku: AUTO_SKU_PLACEHOLDER }],
    });
  });
});
