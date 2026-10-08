import { calculateReplacementPriceDifference } from './replacement-price-difference.util';

describe('calculateReplacementPriceDifference', () => {
  it('collects the full difference when the replacement costs more', () => {
    expect(calculateReplacementPriceDifference(1000, 1200)).toEqual({
      originalAmount: '1000.00',
      replacementAmount: '1200.00',
      differenceAmount: '200.00',
      settlement: 'COLLECT',
    });
  });

  it('refunds the absolute difference when the replacement costs less', () => {
    expect(calculateReplacementPriceDifference(1000, 800)).toEqual({
      originalAmount: '1000.00',
      replacementAmount: '800.00',
      differenceAmount: '200.00',
      settlement: 'REFUND',
    });
  });

  it('stores no settlement when the amounts are equal', () => {
    expect(calculateReplacementPriceDifference(500.004, 500)).toEqual({
      originalAmount: '500.00',
      replacementAmount: '500.00',
      differenceAmount: '0.00',
      settlement: 'NONE',
    });
  });
});
