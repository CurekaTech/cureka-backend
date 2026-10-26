import { ConfigService } from '@nestjs/config';
import { CashfreeSubscriptionProvider } from './cashfree-subscription.provider';

describe('CashfreeSubscriptionProvider payment status', () => {
  const provider = new CashfreeSubscriptionProvider({
    get: (key: string) => {
      if (key === 'CASHFREE_APP_ID') return 'app';
      if (key === 'CASHFREE_SECRET_KEY') return 'secret';
      if (key === 'CASHFREE_ENV') return 'sandbox';
      return undefined;
    },
  } as ConfigService);

  function jsonResponse(body: unknown, ok = true) {
    return { ok, status: ok ? 200 : 500, json: async () => body };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads one successful subscription payment and its amount', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        payments: [
          { payment_id: 'pay_cf', cf_payment_id: 'cf_1', payment_status: 'SUCCESS', payment_amount: 2 },
        ],
      }) as never,
    );

    await expect(
      provider.fetchChargeStatus({ gatewaySubscriptionId: 'sub_1' }),
    ).resolves.toMatchObject({
      state: 'captured',
      amount: '2.00',
      gatewayOrderId: 'pay_cf',
      gatewayPaymentId: 'cf_1',
    });
  });

  it('reports a pending renewal payment without treating it as captured', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        payments: [
          { payment_id: 'pay_pending', cf_payment_id: 'cf_2', payment_status: 'PENDING', payment_amount: 2 },
        ],
      }) as never,
    );

    await expect(
      provider.fetchChargeStatus({
        gatewaySubscriptionId: 'sub_1',
        gatewayOrderId: 'pay_pending',
      }),
    ).resolves.toMatchObject({ state: 'pending', gatewayOrderId: 'pay_pending' });
  });

  it('returns unknown when Cashfree cannot be read, so no second charge is created', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('network down'));
    await expect(
      provider.fetchChargeStatus({ gatewaySubscriptionId: 'sub_1', gatewayOrderId: 'pay_cf' }),
    ).resolves.toMatchObject({ state: 'unknown', gatewayOrderId: 'pay_cf' });
  });

  it('cancels the Cashfree subscription mandate', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ subscription_status: 'CANCELLED' }) as never);

    await expect(provider.cancelMandate({ gatewaySubscriptionId: 'sub_1' })).resolves.toEqual({
      cancelled: true,
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/subscriptions/sub_1/manage');
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toEqual({ action: 'CANCEL' });
  });
});
