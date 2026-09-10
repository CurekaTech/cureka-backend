import { isAmountWithinMandateLimit, resolveMandateMaxAmount } from './mandate-amount.util';

describe('mandate-amount.util', () => {
  it('prefers product mandate max over global', () => {
    expect(
      resolveMandateMaxAmount({ productMandateMaxAmount: '500.00', globalMandateMaxAmount: '999.00' }),
    ).toBe('500.00');
  });

  it('returns null when no explicit max exists — never invents a multiplier', () => {
    expect(resolveMandateMaxAmount({ productMandateMaxAmount: null, globalMandateMaxAmount: null })).toBeNull();
  });

  it('rejects charges above the approved limit', () => {
    expect(isAmountWithinMandateLimit('501.00', '500.00')).toBe(false);
    expect(isAmountWithinMandateLimit('500.00', '500.00')).toBe(true);
  });

  it('rejects charges when no limit is configured', () => {
    expect(isAmountWithinMandateLimit('10.00', null)).toBe(false);
  });
});
