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
      paymentCurrency: '',
    });
  });

  it('reads AUTH success without subscription_status, using snake_case tags and currency', () => {
    const fields = readCashfreeSubscriptionWebhook({
      type: 'SUBSCRIPTION_AUTH_STATUS',
      data: {
        payment_id: 'CH_7526982201947926347',
        cf_payment_id: '1343950428',
        subscription_id: 'sub_new',
        cf_subscription_id: '408977956',
        payment_type: 'AUTH',
        payment_amount: 2,
        payment_status: 'SUCCESS',
        currency: 'INR',
        subscription_details: {
          subscription_id: 'sub_new',
          cf_subscription_id: '408977956',
          subscription_tags: { subscription_payment_id: 'pay-row-2' },
        },
      },
    });

    expect(fields).toMatchObject({
      merchantSubscriptionId: 'sub_new',
      cfSubscriptionId: '408977956',
      subscriptionStatus: '',
      subscriptionPaymentId: 'pay-row-2',
      paymentId: 'CH_7526982201947926347',
      cfPaymentId: '1343950428',
      paymentStatus: 'SUCCESS',
      paymentType: 'AUTH',
      paymentAmount: 2,
      paymentCurrency: 'INR',
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
