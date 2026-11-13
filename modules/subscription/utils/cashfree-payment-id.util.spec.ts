import {
  CASHFREE_MERCHANT_PAYMENT_ID_MAX,
  cashfreeAutopayIdempotencyKey,
  isValidCashfreeMerchantPaymentId,
  toCashfreeMerchantPaymentId,
} from './cashfree-payment-id.util';

describe('toCashfreeMerchantPaymentId', () => {
  it('passes through short alphanumeric ids used in Cashfree examples', () => {
    expect(toCashfreeMerchantPaymentId('PAY-123456')).toBe('PAY-123456');
    expect(toCashfreeMerchantPaymentId('idem-1')).toBe('idem-1');
    expect(isValidCashfreeMerchantPaymentId('PAY-123456')).toBe(true);
  });

  it('rejects the truncated staging value Cashfree returned as invalid', () => {
    const truncated = 'sub:541eb4a9-787b-4bbb-8dad-909845cfa6c9:cycle:202';
    expect(isValidCashfreeMerchantPaymentId(truncated)).toBe(false);
    expect(toCashfreeMerchantPaymentId(truncated)).not.toBe(truncated);
  });

  it('hashes UPS2026024114 cycle keys into a valid, retry-stable id', () => {
    const key = cashfreeAutopayIdempotencyKey(
      '541eb4a9-787b-4bbb-8dad-909845cfa6c9',
      '2026-11-15T1138Z',
    );
    expect(key.slice(0, 50)).toBe('sub:541eb4a9-787b-4bbb-8dad-909845cfa6c9:cycle:202');
    const id = toCashfreeMerchantPaymentId(key);
    expect(id.length).toBeLessThanOrEqual(CASHFREE_MERCHANT_PAYMENT_ID_MAX);
    expect(isValidCashfreeMerchantPaymentId(id)).toBe(true);
    expect(id).not.toContain(':');
    expect(toCashfreeMerchantPaymentId(key)).toBe(id);
  });

  it('uses a different id for a later billing cycle', () => {
    const subId = '541eb4a9-787b-4bbb-8dad-909845cfa6c9';
    const first = toCashfreeMerchantPaymentId(
      cashfreeAutopayIdempotencyKey(subId, '2026-11-15T1138Z'),
    );
    const second = toCashfreeMerchantPaymentId(
      cashfreeAutopayIdempotencyKey(subId, '2026-11-17T1138Z'),
    );
    expect(first).not.toBe(second);
  });
});
