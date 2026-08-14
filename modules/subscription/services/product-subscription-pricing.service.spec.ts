import { ProductSubscriptionPricingService } from './product-subscription-pricing.service';
import { SubscriptionDiscountType } from '../enums/subscription-discount-type.enum';

describe('ProductSubscriptionPricingService', () => {
  const service = new ProductSubscriptionPricingService();

  it('applies percentage subscription discount', () => {
    const result = service.calculate(100, 2, SubscriptionDiscountType.PERCENTAGE, 10);
    expect(result.subscriptionPrice).toBe('200.00');
    expect(result.discountAmount).toBe('20.00');
    expect(result.finalAmount).toBe('180.00');
  });

  it('applies flat subscription discount', () => {
    const result = service.calculate(50, 1, SubscriptionDiscountType.FLAT, 15);
    expect(result.subscriptionPrice).toBe('50.00');
    expect(result.discountAmount).toBe('15.00');
    expect(result.finalAmount).toBe('35.00');
  });

  it('applies member discount after subscription discount', () => {
    const result = service.calculate(100, 1, SubscriptionDiscountType.PERCENTAGE, 10, {
      valueType: 'PERCENTAGE',
      value: 5,
    });
    expect(result.subscriptionPrice).toBe('100.00');
    expect(result.discountAmount).toBe('10.00');
    expect(result.finalAmount).toBe('85.50');
  });

  it('never returns negative final amount', () => {
    const result = service.calculate(10, 1, SubscriptionDiscountType.FLAT, 50);
    expect(result.finalAmount).toBe('0.00');
  });
});
