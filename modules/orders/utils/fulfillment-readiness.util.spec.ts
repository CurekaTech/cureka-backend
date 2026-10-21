import { OrderPaymentMethod } from '../enums/order-payment-method.enum';
import { OrderPaymentStatus } from '../enums/order-payment-status.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { CancellationStatus } from '../enums/cancellation-status.enum';
import { isReadyForUnicommercePush, shipwayMustNotDriveOrder } from './fulfillment-readiness.util';

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

  it('blocks orders with an in-flight cancellation even if still CONFIRMED', () => {
    expect(
      isReadyForUnicommercePush({
        paymentMethod: OrderPaymentMethod.COD,
        paymentStatus: OrderPaymentStatus.PENDING,
        orderStatus: OrderStatus.CONFIRMED,
        cancellationStatus: CancellationStatus.PROCESSING,
      }),
    ).toBe(false);
  });

  it('keeps Shipway off failed and unpaid prepaid orders', () => {
    expect(
      shipwayMustNotDriveOrder({
        paymentMethod: OrderPaymentMethod.RAZORPAY,
        paymentStatus: OrderPaymentStatus.FAILED,
      }),
    ).toBe(true);

    expect(
      shipwayMustNotDriveOrder({
        paymentMethod: OrderPaymentMethod.CASHFREE,
        paymentStatus: OrderPaymentStatus.PENDING,
      }),
    ).toBe(true);

    expect(
      shipwayMustNotDriveOrder({
        paymentMethod: OrderPaymentMethod.COD,
        paymentStatus: OrderPaymentStatus.PENDING,
      }),
    ).toBe(false);

    expect(
      shipwayMustNotDriveOrder({
        paymentMethod: OrderPaymentMethod.RAZORPAY,
        paymentStatus: OrderPaymentStatus.PAID,
      }),
    ).toBe(false);
  });

  it('blocks unresolved cancellation attention so a failed cancel cannot be exported again', () => {
    expect(
      isReadyForUnicommercePush({
        paymentMethod: OrderPaymentMethod.COD,
        paymentStatus: OrderPaymentStatus.PENDING,
        orderStatus: OrderStatus.CONFIRMED,
        cancellationStatus: CancellationStatus.REQUIRES_ATTENTION,
      }),
    ).toBe(false);
  });
});
