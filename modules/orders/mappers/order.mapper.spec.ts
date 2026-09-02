import { OrderPaymentMethod } from '../enums/order-payment-method.enum';
import { OrderPaymentStatus } from '../enums/order-payment-status.enum';
import { mapOrderPaymentSummary } from '../mappers/order.mapper';

describe('mapOrderPaymentSummary', () => {
  const baseOrder = {
    subtotal: '750.00',
    discountAmount: '50.00',
    shippingAmount: '45.00',
    grandTotal: '745.00',
    paymentMethod: OrderPaymentMethod.COD,
    paymentStatus: OrderPaymentStatus.PENDING,
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
