import { pickVariableProductInformationCascade } from './variable-product-information-cascade.util';

describe('variable-product-information-cascade.util', () => {
  it('returns null when productInformation is not in the dto', () => {
    expect(
      pickVariableProductInformationCascade(
        { name: 'Updated name', description: 'Only description' },
        { name: 'Updated name', description: 'Only description' },
      ),
    ).toBeNull();
  });

  it('cascades normalized productInformation to variants', () => {
    const productInformation = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        labelRefId: 'HIG20261234',
        label: 'Benefits',
        description: 'Helps with pain relief.',
        sortOrder: 1,
      },
    ];

    const result = pickVariableProductInformationCascade(
      { productInformation },
      { productInformation },
    );

    expect(result).toEqual(productInformation);
    expect(result).not.toBe(productInformation);
  });

  it('cascades empty productInformation to clear variant JSON', () => {
    const result = pickVariableProductInformationCascade(
      { productInformation: [] },
      { productInformation: [] },
    );

    expect(result).toEqual([]);
  });
});
