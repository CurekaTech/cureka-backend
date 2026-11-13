import {
  CASHFREE_HOSTED_CHECKOUT_PATH,
  cashfreeHostedCheckoutHtml,
  cashfreeHostedCheckoutUrl,
  cashfreeSubscriptionHostedCheckoutUrl,
  normalizeCashfreePaymentSessionId,
  rewriteCashfreeHostedCheckoutUrl,
} from './cashfree-checkout-url.util';

describe('cashfree hosted checkout URL', () => {
  it('builds a storefront launcher URL, not payments.cashfree.com/pg/view/checkout', () => {
    expect(cashfreeHostedCheckoutUrl('session_abc', 'production', 'https://cureka.techbv.in')).toBe(
      `https://cureka.techbv.in${CASHFREE_HOSTED_CHECKOUT_PATH}?payment_session_id=session_abc`,
    );
    expect(cashfreeHostedCheckoutUrl('session_abc', 'production')).toBe(
      `${CASHFREE_HOSTED_CHECKOUT_PATH}?payment_session_id=session_abc`,
    );
  });

  it('posts the session to Cashfree sessions checkout, not a GET checkout URL', () => {
    const html = cashfreeHostedCheckoutHtml('session_abc', 'production');
    expect(html).toContain('https://api.cashfree.com/pg/view/sessions/checkout');
    expect(html).toContain('name="payment_session_id"');
    expect(html).toContain('value="session_abc"');
    expect(html).not.toContain('payments.cashfree.com/pg/view/checkout');
  });

  it('keeps subscription sessions on the subscription hosted URL', () => {
    expect(
      rewriteCashfreeHostedCheckoutUrl(
        'https://api.cashfree.com/pg/view/subscriptions?subscription_session_id=session_sub',
      ),
    ).toBe(cashfreeSubscriptionHostedCheckoutUrl('session_sub', 'production'));
  });

  it('rewrites the 404 payments.cashfree.com checkout URL to the launcher', () => {
    const broken =
      'https://payments.cashfree.com/pg/view/checkout?payment_session_id=session_E-vT1GA2q2yw7kx5oLo0lZU_elG9WsyKvPXvxO1PYLrL-h4aEhS2PVFvLFGxLxyXmlU6XHVzHfhNIWMWbl_flqpirCWye37Ruk3UaqkchNMM5KwXPu9VX6053w';
    expect(rewriteCashfreeHostedCheckoutUrl(broken, 'https://cureka.techbv.in')).toBe(
      `https://cureka.techbv.in${CASHFREE_HOSTED_CHECKOUT_PATH}?payment_session_id=session_E-vT1GA2q2yw7kx5oLo0lZU_elG9WsyKvPXvxO1PYLrL-h4aEhS2PVFvLFGxLxyXmlU6XHVzHfhNIWMWbl_flqpirCWye37Ruk3UaqkchNMM5KwXPu9VX6053w`,
    );
  });

  it('strips a glued paymentpayment suffix from stored /order/ links', () => {
    const broken =
      'https://payments.cashfree.com/order/session_E-vT1GA2q2yw7kx5oLo0lZU_elG9WsyKvPXvxO1PYLrL-h4aEhS2PVFvLFGxLxyXmlU6XHVzHfhNIWMWbl_flqpirCWye37Ruk3UaqkchNMM5KwXPu9VX6053wpaymentpayment';
    expect(rewriteCashfreeHostedCheckoutUrl(broken, 'https://cureka.techbv.in')).toBe(
      `https://cureka.techbv.in${CASHFREE_HOSTED_CHECKOUT_PATH}?payment_session_id=session_E-vT1GA2q2yw7kx5oLo0lZU_elG9WsyKvPXvxO1PYLrL-h4aEhS2PVFvLFGxLxyXmlU6XHVzHfhNIWMWbl_flqpirCWye37Ruk3UaqkchNMM5KwXPu9VX6053w`,
    );
    expect(normalizeCashfreePaymentSessionId('session_abcpaymentpayment')).toBe('session_abc');
  });
});
