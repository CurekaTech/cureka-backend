import { buildSavedForLaterIdentityKey } from './saved-for-later-identity.util';
import { ProductSubscriptionFrequency } from '@modules/subscription/enums/product-subscription-frequency.enum';

describe('buildSavedForLaterIdentityKey', () => {
  it('matches cart duplicate identity for one-time items', () => {
    expect(buildSavedForLaterIdentityKey('variant-1', false, null)).toBe('variant-1:0:');
  });

  it('keeps subscription frequency in the key', () => {
    expect(
      buildSavedForLaterIdentityKey('variant-1', true, ProductSubscriptionFrequency.MONTHLY),
    ).toBe('variant-1:1:MONTHLY');
  });

  it('treats one-time and subscription as different items', () => {
    expect(buildSavedForLaterIdentityKey('variant-1', false, null)).not.toBe(
      buildSavedForLaterIdentityKey('variant-1', true, ProductSubscriptionFrequency.MONTHLY),
    );
  });
});
