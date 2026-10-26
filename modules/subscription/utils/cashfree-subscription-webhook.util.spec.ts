import { readCashfreeSubscriptionWebhook } from './cashfree-subscription-webhook.util';

describe('readCashfreeSubscriptionWebhook', () => {
  it('reads the 2025 subscription status payload', () => {
    const fields = readCashfreeSubscriptionWebhook({
      type: 'SUBSCRIPTION_STATUS_CHANGED',
      data: {
        subscription_details: {
          cf_subscription_id: '23639356',
          subscription_id: 'sub_cureka',
          subscription_status: 'ACTIVE',
          subscription_tags: { subscriptionPaymentId: 'pay-row-1' },
        },
        payment_gateway_details: { gateway_subscription_id: '23639356' },
      },
    });

    expect(fields).toMatchObject({
      merchantSubscriptionId: 'sub_cureka',
      cfSubscriptionId: '23639356',
      subscriptionStatus: 'ACTIVE',
      subscriptionPaymentId: 'pay-row-1',
    });
  });

  it('reads a subscription payment success payload', () => {
    const fields = readCashfreeSubscriptionWebhook({
      type: 'SUBSCRIPTION_PAYMENT_SUCCESS',
      data: {
        payment_id: 'pay_cf_1',
        cf_payment_id: '49914526',
        subscription_id: 'sub_cureka',
        cf_subscription_id: '23601811',
        payment_type: 'AUTH',
        payment_amount: 2,
        payment_status: 'SUCCESS',
        subscription_details: {
          subscription_id: 'sub_cureka',
          cf_subscription_id: '23601811',
          subscription_status: 'ACTIVE',
          subscription_tags: { subscriptionPaymentId: 'pay-row-1' },
        },
      },
    });

    expect(fields).toMatchObject({
      merchantSubscriptionId: 'sub_cureka',
      cfSubscriptionId: '23601811',
      subscriptionStatus: 'ACTIVE',
      subscriptionPaymentId: 'pay-row-1',
      paymentId: 'pay_cf_1',
      cfPaymentId: '49914526',
      paymentStatus: 'SUCCESS',
      paymentType: 'AUTH',
      paymentAmount: 2,
    });
  });

  it('still reads an older nested subscription object', () => {
    const fields = readCashfreeSubscriptionWebhook({
      type: 'SUBSCRIPTION_STATUS_CHANGED',
      data: {
        subscription: {
          subscription_id: 'sub_old',
          cf_subscription_id: '99',
          subscription_status: 'ACTIVE',
          subscription_tags: { subscriptionPaymentId: 'pay-old' },
        },
      },
    });

    expect(fields.merchantSubscriptionId).toBe('sub_old');
    expect(fields.cfSubscriptionId).toBe('99');
    expect(fields.subscriptionPaymentId).toBe('pay-old');
  });
});
