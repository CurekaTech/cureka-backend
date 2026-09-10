import {
  reconstructUnicommerceSaleOrderItemCodes,
  selectUnicommerceReversePickItemCodes,
} from './unicommerce-reverse-pickup.mapper';

describe('unicommerce-reverse-pickup.mapper', () => {
  it('reconstructs createSaleOrder unit codes from original order quantities', () => {
    const codes = reconstructUnicommerceSaleOrderItemCodes('CUR1', [
      { sku: 'SKU-A', quantity: 2 },
      { sku: 'SKU-B', quantity: 1 },
    ]);

    expect(codes.map((item) => item.code)).toEqual(['CUR1-1', 'CUR1-2', 'CUR1-3']);
    expect(codes.map((item) => item.itemSku)).toEqual(['SKU-A', 'SKU-A', 'SKU-B']);
  });

  it('selects the requested quantity of eligible Uniware item codes per SKU', () => {
    const selected = selectUnicommerceReversePickItemCodes(
      [
        { code: 'CUR1-1', itemSku: 'SKU-A', statusCode: 'DELIVERED' },
        { code: 'CUR1-2', itemSku: 'SKU-A', statusCode: 'DELIVERED' },
        { code: 'CUR1-3', itemSku: 'SKU-B', statusCode: 'DELIVERED' },
        { code: 'CUR1-4', itemSku: 'SKU-A', statusCode: 'CANCELLED' },
      ],
      [{ sku: 'SKU-A', quantity: 1 }],
    );

    expect(selected).toEqual(['CUR1-1']);
  });

  it('throws when Uniware does not have enough eligible units', () => {
    expect(() =>
      selectUnicommerceReversePickItemCodes(
        [{ code: 'CUR1-1', itemSku: 'SKU-A', statusCode: 'RETURNED' }],
        [{ sku: 'SKU-A', quantity: 1 }],
      ),
    ).toThrow(/SKU-A/);
  });
});
