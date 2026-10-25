import {
  RAZORPAY_UPI_LIVE_PREDEBIT_MS,
  RAZORPAY_UPI_TEST_PREDEBIT_MS,
  classifyRazorpayPaymentStatus,
  razorpaySubscriptionEventSettlesPayment,
  razorpayUpiPaymentAfter,
} from './razorpay-upi-debit.util';

describe('Razorpay UPI pre-debit timing', () => {
  const now = new Date('2026-10-25T12:00:00.000Z');

  it('keeps live UPI at least 25 hours ahead, including a 5-minute tenure', () => {
    const debitAt = razorpayUpiPaymentAfter({
      now,
      keyId: 'rzp_live_example',
      allowShortWindow: true,
    });
    expect(debitAt.getTime() - now.getTime()).toBe(RAZORPAY_UPI_LIVE_PREDEBIT_MS);
    expect(debitAt.getTime() - now.getTime()).toBeGreaterThan(25 * 60 * 60 * 1000);
  });

  it('uses a two-minute window only for an rzp_test_ key', () => {
    const debitAt = razorpayUpiPaymentAfter({
      now,
      keyId: 'rzp_test_example',
      allowShortWindow: true,
    });
    expect(debitAt.getTime() - now.getTime()).toBe(RAZORPAY_UPI_TEST_PREDEBIT_MS);
  });

  it('does not shorten a test key when the tenure is a normal billing cycle', () => {
    const debitAt = razorpayUpiPaymentAfter({
      now,
      keyId: 'rzp_test_example',
      allowShortWindow: false,
    });
    expect(debitAt.getTime() - now.getTime()).toBe(RAZORPAY_UPI_LIVE_PREDEBIT_MS);
  });

  it('classifies uncaptured and unknown Razorpay statuses', () => {
    expect(classifyRazorpayPaymentStatus('captured')).toBe('captured');
    expect(classifyRazorpayPaymentStatus('created')).toBe('pending');
    expect(classifyRazorpayPaymentStatus('authorized')).toBe('pending');
    expect(classifyRazorpayPaymentStatus('failed')).toBe('failed');
    expect(classifyRazorpayPaymentStatus('refunded')).toBe('unknown');
    expect(classifyRazorpayPaymentStatus(null)).toBe('unknown');
  });
});

describe('Razorpay subscription webhook settlement', () => {
  it('ignores payment.authorized', () => {
    expect(razorpaySubscriptionEventSettlesPayment('payment.authorized', 'authorized')).toBe('ignore');
  });

  it('accepts payment.captured only when the payment status is captured', () => {
    expect(razorpaySubscriptionEventSettlesPayment('payment.captured', 'captured')).toBe('paid');
    expect(razorpaySubscriptionEventSettlesPayment('payment.captured', 'authorized')).toBe('ignore');
    expect(razorpaySubscriptionEventSettlesPayment('payment.captured', null)).toBe('verify');
  });

  it('accepts order.paid only after a captured payment', () => {
    expect(razorpaySubscriptionEventSettlesPayment('order.paid', 'captured')).toBe('paid');
    expect(razorpaySubscriptionEventSettlesPayment('order.paid', 'authorized')).toBe('ignore');
    expect(razorpaySubscriptionEventSettlesPayment('order.paid', undefined)).toBe('verify');
  });
});
