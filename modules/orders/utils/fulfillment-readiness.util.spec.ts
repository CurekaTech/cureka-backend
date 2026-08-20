import { OrderPaymentMethod } from '../enums/order-payment-method.enum';
import { OrderPaymentStatus } from '../enums/order-payment-status.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { isReadyForUnicommercePush } from './fulfillment-readiness.util';

describe('isReadyForUnicommercePush', () => {
  it('allows COD when CONFIRMED with payment still PENDING', () => {
    expect(
      isReadyForUnicommercePush({
        paymentMethod: OrderPaymentMethod.COD,
        paymentStatus: OrderPaymentStatus.PENDING,
        orderStatus: OrderStatus.CONFIRMED,
      }),
    ).toBe(true);
  });

  it('allows COD once order is past PENDING (e.g. PROCESSING)', () => {
    expect(
      isReadyForUnicommercePush({
        paymentMethod: OrderPaymentMethod.COD,
        paymentStatus: OrderPaymentStatus.PENDING,
        orderStatus: OrderStatus.PROCESSING,
      }),
    ).toBe(true);
  });

  it('blocks COD while still PENDING draft', () => {
    expect(
      isReadyForUnicommercePush({
        paymentMethod: OrderPaymentMethod.COD,
        paymentStatus: OrderPaymentStatus.PENDING,
        orderStatus: OrderStatus.PENDING,
      }),
    ).toBe(false);
  });

  it('blocks unpaid prepaid', () => {
    expect(
      isReadyForUnicommercePush({
        paymentMethod: OrderPaymentMethod.RAZORPAY,
        paymentStatus: OrderPaymentStatus.PENDING,
        orderStatus: OrderStatus.PROCESSING,
      }),
    ).toBe(false);
  });

  it('allows PAID / PARTIALLY_PAID prepaid when not PENDING', () => {
    expect(
      isReadyForUnicommercePush({
        paymentMethod: OrderPaymentMethod.GOKWIK_PREPAID,
        paymentStatus: OrderPaymentStatus.PAID,
        orderStatus: OrderStatus.CONFIRMED,
      }),
    ).toBe(true);

    expect(
      isReadyForUnicommercePush({
        paymentMethod: OrderPaymentMethod.GOKWIK_PARTIAL_COD,
        paymentStatus: OrderPaymentStatus.PARTIALLY_PAID,
        orderStatus: OrderStatus.CONFIRMED,
      }),
    ).toBe(true);
  });

  it('blocks cancelled orders', () => {
    expect(
      isReadyForUnicommercePush({
        paymentMethod: OrderPaymentMethod.COD,
        paymentStatus: OrderPaymentStatus.PENDING,
        orderStatus: OrderStatus.CANCELLED,
      }),
    ).toBe(false);
  });
});
