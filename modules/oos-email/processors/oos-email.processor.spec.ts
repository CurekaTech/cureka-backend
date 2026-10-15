import { oosEmailLabels } from './oos-email.processor';

describe('oosEmailLabels', () => {
  it('uses the catalogue product name when the variant title is the SKU', () => {
    expect(
      oosEmailLabels({
        sku: 'HEA/COM/00002',
        productName: 'Hearing Aid Combo',
        variantDisplayName: 'HEA/COM/00002',
      }),
    ).toEqual({ product: 'Hearing Aid Combo', variant: '' });
  });

  it('keeps a distinct variant name beside the product name', () => {
    expect(
      oosEmailLabels({
        sku: 'HEA/COM/00002',
        productName: 'Hearing Aid Combo',
        variantDisplayName: 'Pack of 2',
      }),
    ).toEqual({ product: 'Hearing Aid Combo', variant: 'Pack of 2' });
  });

  it('falls back to the SKU only when no product name is available', () => {
    expect(oosEmailLabels({ sku: 'HEA/COM/00002', productName: null, variantDisplayName: null })).toEqual({
      product: 'HEA/COM/00002',
      variant: '',
    });
  });
});
