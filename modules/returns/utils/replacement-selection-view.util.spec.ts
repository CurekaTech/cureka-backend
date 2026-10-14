import { customerReplacementSelection } from './replacement-selection-view.util';

describe('customerReplacementSelection', () => {
  const item = {
    preferredReplacementVariantId: 'variant-30',
    preferredReplacementSku: 'A-30',
    preferredReplacementProductName: 'Product A',
    preferredReplacementVariantName: '30 tablets',
    replacementVariantId: 'variant-60',
    replacementSku: 'A-60',
    replacementProductName: 'Product A',
    replacementVariantName: '60 tablets',
  };

  it('hides the confirmed variant until settlement is stored', () => {
    expect(customerReplacementSelection(item, false)).toMatchObject({
      preferredReplacementVariantId: 'variant-30',
      replacementVariantId: null,
      replacementSku: null,
    });
  });

  it('shows the stored confirmation after settlement without dropping the preference', () => {
    expect(customerReplacementSelection(item, true)).toMatchObject({
      preferredReplacementVariantId: 'variant-30',
      preferredReplacementVariantName: '30 tablets',
      replacementVariantId: 'variant-60',
      replacementVariantName: '60 tablets',
    });
  });

  it('does not invent a preference for a legacy confirmed row', () => {
    expect(
      customerReplacementSelection(
        {
          replacementVariantId: 'variant-60',
          replacementSku: 'A-60',
        },
        true,
      ),
    ).toMatchObject({
      preferredReplacementVariantId: null,
      replacementVariantId: 'variant-60',
    });
  });
});
