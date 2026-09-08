import { OrderPaymentMethod } from '../enums/order-payment-method.enum';
import { isCodPaymentMethod } from '../utils/payment-method.util';

describe('isCodPaymentMethod', () => {
  it('returns true for COD and GoKwik partial COD', () => {
    expect(isCodPaymentMethod(OrderPaymentMethod.COD)).toBe(true);
    expect(isCodPaymentMethod(OrderPaymentMethod.GOKWIK_PARTIAL_COD)).toBe(true);
  });

  it('returns false for prepaid methods and undefined', () => {
    expect(isCodPaymentMethod(OrderPaymentMethod.RAZORPAY)).toBe(false);
    expect(isCodPaymentMethod(OrderPaymentMethod.GOKWIK_PREPAID)).toBe(false);
    expect(isCodPaymentMethod(undefined)).toBe(false);
  });
});
