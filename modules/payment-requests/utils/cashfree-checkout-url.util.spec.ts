import {
  cashfreeHostedCheckoutUrl,
  normalizeCashfreePaymentSessionId,
  rewriteCashfreeHostedCheckoutUrl,
} from './cashfree-checkout-url.util';

describe('cashfree hosted checkout URL', () => {
  it('builds production checkout with payment_session_id query, not /order/{session}', () => {
    expect(cashfreeHostedCheckoutUrl('session_abc', 'production')).toBe(
      'https://payments.cashfree.com/pg/view/checkout?payment_session_id=session_abc',
    );
  });

  it('strips a glued paymentpayment suffix from stored /order/ links', () => {
    const broken =
      'https://payments.cashfree.com/order/session_E-vT1GA2q2yw7kx5oLo0lZU_elG9WsyKvPXvxO1PYLrL-h4aEhS2PVFvLFGxLxyXmlU6XHVzHfhNIWMWbl_flqpirCWye37Ruk3UaqkchNMM5KwXPu9VX6053wpaymentpayment';
    expect(rewriteCashfreeHostedCheckoutUrl(broken)).toBe(
      'https://payments.cashfree.com/pg/view/checkout?payment_session_id=session_E-vT1GA2q2yw7kx5oLo0lZU_elG9WsyKvPXvxO1PYLrL-h4aEhS2PVFvLFGxLxyXmlU6XHVzHfhNIWMWbl_flqpirCWye37Ruk3UaqkchNMM5KwXPu9VX6053w',
    );
    expect(normalizeCashfreePaymentSessionId('session_abcpaymentpayment')).toBe('session_abc');
  });
});
