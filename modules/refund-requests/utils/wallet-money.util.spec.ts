import { paiseToRupees, rupeesToPaise } from './wallet-money.util';

describe('wallet money conversion', () => {
  it.each([
    ['0', 0],
    ['1.2', 120],
    ['1.23', 123],
    ['1.234', 123],
    ['1.235', 124],
    ['10.999', 1100],
    ['-0.015', -2],
  ])('converts %s rupees to paise', (rupees, expected) => {
    expect(rupeesToPaise(rupees)).toBe(expected);
  });

  it.each([
    [0, '0.00'],
    [1, '0.01'],
    [123, '1.23'],
    [-123, '-1.23'],
  ])('converts %s paise to the existing rupee string format', (paise, expected) => {
    expect(paiseToRupees(paise)).toBe(expected);
  });

  it('rejects malformed amounts', () => {
    expect(() => rupeesToPaise('1.2.3')).toThrow();
  });
});
