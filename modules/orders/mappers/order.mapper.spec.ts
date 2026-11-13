import { PaymentRequestStatus } from '@modules/payment-requests/enums/payment-request-status.enum';
import { OrderPaymentMethod } from '../enums/order-payment-method.enum';
import { OrderPaymentStatus } from '../enums/order-payment-status.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { PolicyWindowUnit } from '@modules/product/enums/policy-window-unit.enum';
import { IOrderItemReturnPolicySnapshot } from '../interfaces/order-item-return-policy.interface';
import {
  isAdminActorEmail,
  isAdminActorId,
  isPlacedByActorKey,
  mapAdminPlacedBy,
  mapOrderPaymentSummary,
  mapPaymentRequestToOrderStatuses,
  pickPlacedByActorKey,
  resolveOrderItemReturnReplace,
  withPlacedBy,
} from './order.mapper';

describe('mapOrderPaymentSummary', () => {
  const baseOrder = {
    subtotal: '750.00',
    discountAmount: '50.00',
    shippingAmount: '45.00',
    grandTotal: '745.00',
    paymentMethod: OrderPaymentMethod.COD,
    paymentStatus: OrderPaymentStatus.PENDING,
    walletAmountPaise: '0',
    gatewayAmountPaise: '74500',
  };

  it('maps stored decimal strings to numeric payment summary fields', () => {
    const summary = mapOrderPaymentSummary(baseOrder);
    expect(summary).toEqual({
      itemTotal: 750,
      discount: 50,
      shipping: 45,
      tax: 0,
      grandTotal: 745,
      paidAmount: 0,
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      walletAmount: 0,
      gatewayAmount: 745,
    });
  });

  it('preserves valid zero values as numbers', () => {
    const summary = mapOrderPaymentSummary({
      ...baseOrder,
      discountAmount: '0.00',
      shippingAmount: '0.00',
      grandTotal: '700.00',
    });

    expect(summary.discount).toBe(0);
    expect(summary.shipping).toBe(0);
    expect(summary.grandTotal).toBe(700);
  });

  it('returns paidAmount equal to grandTotal when payment status is PAID', () => {
    const summary = mapOrderPaymentSummary({
      ...baseOrder,
      paymentMethod: OrderPaymentMethod.RAZORPAY,
      paymentStatus: OrderPaymentStatus.PAID,
      grandTotal: '695.00',
    });

    expect(summary.paidAmount).toBe(695);
    expect(summary.paymentMethod).toBe('RAZORPAY');
    expect(summary.paymentStatus).toBe('PAID');
  });
});

describe('resolveOrderItemReturnReplace', () => {
  const deliveredAt = new Date('2026-10-01T00:00:00.000Z');
  const snapshot = (
    overrides: Partial<IOrderItemReturnPolicySnapshot> = {},
  ): IOrderItemReturnPolicySnapshot => ({
    source: 'SNAPSHOT',
    capturedAt: deliveredAt.toISOString(),
    returnable: true,
    refundable: true,
    replaceable: true,
    returnWindow: 2,
    returnWindowUnit: PolicyWindowUnit.DAYS,
    replacementWindow: 2,
    replacementWindowUnit: PolicyWindowUnit.DAYS,
    pickupRequired: true,
    qcRequired: true,
    customerEvidenceRequired: false,
    noPickupRefundAllowed: false,
    policyText: null,
    ...overrides,
  });

  it('keeps the window open on the day it was delivered', () => {
    const flags = resolveOrderItemReturnReplace(snapshot(), deliveredAt, true, deliveredAt);
    expect(flags.returnAllowed).toBe(true);
    expect(flags.replaceAllowed).toBe(true);
    expect(flags.returnWindowDays).toBe(2);
    expect(flags.replaceWindowDays).toBe(2);
    expect(flags.withinReturnWindow).toBe(true);
    expect(flags.withinReplaceWindow).toBe(true);
  });

  it('closes the window after the variant window days', () => {
    const flags = resolveOrderItemReturnReplace(
      snapshot(),
      deliveredAt,
      true,
      new Date('2026-10-04T00:00:00.000Z'),
    );
    expect(flags.returnAllowed).toBe(true);
    expect(flags.withinReturnWindow).toBe(false);
    expect(flags.withinReplaceWindow).toBe(false);
  });

  it('does not open a window when the ordered variant disallows the action', () => {
    const flags = resolveOrderItemReturnReplace(
      snapshot({ returnable: false, replaceable: false }),
      deliveredAt,
      true,
      deliveredAt,
    );
    expect(flags.returnAllowed).toBe(false);
    expect(flags.replaceAllowed).toBe(false);
    expect(flags.withinReturnWindow).toBe(false);
    expect(flags.withinReplaceWindow).toBe(false);
  });

  it('keeps both windows closed until the order is delivered', () => {
    const flags = resolveOrderItemReturnReplace(snapshot(), deliveredAt, false, deliveredAt);
    expect(flags.returnAllowed).toBe(true);
    expect(flags.replaceAllowed).toBe(true);
    expect(flags.withinReturnWindow).toBe(false);
    expect(flags.withinReplaceWindow).toBe(false);
  });

  it('uses a 2 day window when the snapshot window is missing', () => {
    const flags = resolveOrderItemReturnReplace(
      snapshot({
        returnWindow: null,
        replacementWindow: 0,
      }),
      deliveredAt,
      true,
      new Date('2026-10-02T00:00:00.000Z'),
    );
    expect(flags.returnWindowDays).toBe(2);
    expect(flags.replaceWindowDays).toBe(2);
    expect(flags.withinReturnWindow).toBe(true);
    expect(flags.withinReplaceWindow).toBe(true);
  });

  it('hides both actions when the order has no policy snapshot', () => {
    expect(resolveOrderItemReturnReplace(null, deliveredAt, true)).toEqual({
      returnAllowed: false,
      replaceAllowed: false,
      returnWindowDays: null,
      replaceWindowDays: null,
      withinReturnWindow: false,
      withinReplaceWindow: false,
    });
  });
});

describe('mapPaymentRequestToOrderStatuses', () => {
  it('maps unpaid admin payment requests to a pending order', () => {
    expect(mapPaymentRequestToOrderStatuses(PaymentRequestStatus.PAYMENT_PENDING)).toEqual({
      orderStatus: OrderStatus.PENDING,
      paymentStatus: OrderPaymentStatus.PENDING,
    });
    expect(mapPaymentRequestToOrderStatuses(PaymentRequestStatus.LINK_GENERATED)).toEqual({
      orderStatus: OrderStatus.PENDING,
      paymentStatus: OrderPaymentStatus.PENDING,
    });
  });

  it('maps paid and failed payment requests to matching order payment status', () => {
    expect(mapPaymentRequestToOrderStatuses(PaymentRequestStatus.PAID)).toEqual({
      orderStatus: OrderStatus.CONFIRMED,
      paymentStatus: OrderPaymentStatus.PAID,
    });
    expect(mapPaymentRequestToOrderStatuses(PaymentRequestStatus.FAILED)).toEqual({
      orderStatus: OrderStatus.PENDING,
      paymentStatus: OrderPaymentStatus.FAILED,
    });
  });

  it('maps cancelled and expired payment requests to a cancelled order', () => {
    expect(mapPaymentRequestToOrderStatuses(PaymentRequestStatus.CANCELLED)).toEqual({
      orderStatus: OrderStatus.CANCELLED,
      paymentStatus: OrderPaymentStatus.PENDING,
    });
    expect(mapPaymentRequestToOrderStatuses(PaymentRequestStatus.EXPIRED)).toEqual({
      orderStatus: OrderStatus.CANCELLED,
      paymentStatus: OrderPaymentStatus.PENDING,
    });
  });
});

describe('admin placedBy mapping', () => {
  it('accepts UUID actor ids and rejects webhook placeholders', () => {
    expect(isAdminActorId('3fa85f64-5717-4562-b3fc-2c963f66afa6')).toBe(true);
    expect(isAdminActorId('razorpay-webhook')).toBe(false);
    expect(isAdminActorId(null)).toBe(false);
  });

  it('accepts admin emails and rejects webhook / system actors', () => {
    expect(isAdminActorEmail('imran-admin@gmail.com')).toBe(true);
    expect(isPlacedByActorKey('imran-admin@gmail.com')).toBe(true);
    expect(isPlacedByActorKey('razorpay-webhook')).toBe(false);
    expect(pickPlacedByActorKey('razorpay-webhook', 'imran-admin@gmail.com')).toBe(
      'imran-admin@gmail.com',
    );
  });

  it('maps admin staff name, email, and role, and returns null when missing', () => {
    expect(
      mapAdminPlacedBy({
        id: 'admin-1',
        fullName: 'Priya Sharma',
        email: 'priya@cureka.com',
        role: 'super_admin',
        roleRecord: { name: 'Super Admin', slug: 'super_admin' },
      }),
    ).toEqual({
      id: 'admin-1',
      fullName: 'Priya Sharma',
      username: 'Priya Sharma',
      email: 'priya@cureka.com',
      role: 'Super Admin',
    });
    expect(mapAdminPlacedBy(null)).toBeNull();
  });

  it('attaches placedBy onto an admin order response', () => {
    const attached = withPlacedBy(
      { placedBy: null } as Parameters<typeof withPlacedBy>[0],
      { id: 'admin-1', fullName: 'Asha', email: 'asha@cureka.com', role: 'telecaller' },
    );
    expect(attached.placedBy).toEqual({
      id: 'admin-1',
      fullName: 'Asha',
      username: 'Asha',
      email: 'asha@cureka.com',
      role: 'telecaller',
    });
  });
});
