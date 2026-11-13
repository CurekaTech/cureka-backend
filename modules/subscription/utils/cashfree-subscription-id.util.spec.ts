import {
  isCashfreeMerchantSubscriptionId,
  isCashfreeNumericReferenceId,
  resolveCashfreeMerchantSubscriptionId,
  resolveCashfreeNumericReferenceId,
} from './cashfree-subscription-id.util';

describe('cashfree-subscription-id.util', () => {
  it('treats sub_… as the merchant subscription_id and digits as cf_subscription_id', () => {
    expect(isCashfreeMerchantSubscriptionId('sub_39a38148-135b-4eb2-9860-487073358212')).toBe(true);
    expect(isCashfreeNumericReferenceId('408863225')).toBe(true);
    expect(isCashfreeMerchantSubscriptionId('408863225')).toBe(false);
  });

  it('prefers the merchant id when both identifiers are present', () => {
    expect(
      resolveCashfreeMerchantSubscriptionId(
        '408863225',
        'sub_39a38148-135b-4eb2-9860-487073358212',
      ),
    ).toBe('sub_39a38148-135b-4eb2-9860-487073358212');
    expect(resolveCashfreeNumericReferenceId('sub_abc', '408863225')).toBe('408863225');
  });

  it('does not fall back to a numeric Cashfree reference as the API path id', () => {
    expect(resolveCashfreeMerchantSubscriptionId('408863225', '408861010')).toBeUndefined();
  });
});
