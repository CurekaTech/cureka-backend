import { BadRequestException } from '@nestjs/common';
import { ProductSubscriptionFrequency } from '../enums/product-subscription-frequency.enum';
import {
  assertProductFrequenciesAllowed,
  TEST_PRODUCT_FREQUENCIES,
} from './subscription-test-tenures.util';

describe('subscription-test-tenures.util', () => {
  it('includes HOURS_48 and HOURS_72 as staging-only product frequencies', () => {
    expect(TEST_PRODUCT_FREQUENCIES.has(ProductSubscriptionFrequency.HOURS_48)).toBe(true);
    expect(TEST_PRODUCT_FREQUENCIES.has(ProductSubscriptionFrequency.HOURS_72)).toBe(true);
    expect(TEST_PRODUCT_FREQUENCIES.has(ProductSubscriptionFrequency.MONTHLY)).toBe(false);
  });

  it('rejects HOURS_48 and HOURS_72 when test tenures are disabled', () => {
    const config = { get: jest.fn(() => false) };
    expect(() =>
      assertProductFrequenciesAllowed(config, [ProductSubscriptionFrequency.HOURS_48]),
    ).toThrow(BadRequestException);
    expect(() =>
      assertProductFrequenciesAllowed(config, [ProductSubscriptionFrequency.HOURS_72]),
    ).toThrow(BadRequestException);
    expect(() =>
      assertProductFrequenciesAllowed(config, [ProductSubscriptionFrequency.MONTHLY]),
    ).not.toThrow();
  });

  it('allows HOURS_48 and HOURS_72 when test tenures are enabled', () => {
    const config = { get: jest.fn(() => true) };
    expect(() =>
      assertProductFrequenciesAllowed(config, [
        ProductSubscriptionFrequency.HOURS_48,
        ProductSubscriptionFrequency.HOURS_72,
        ProductSubscriptionFrequency.MONTHLY,
      ]),
    ).not.toThrow();
  });
});
