import { ConfigService } from '@nestjs/config';
import { formatCashfreeScheduleDate } from '../../utils/cashfree-schedule-date.util';
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
          {
            payment_id: 'pay_cf',
            cf_payment_id: 'cf_1',
            payment_status: 'SUCCESS',
            payment_amount: 2,
            payment_currency: 'INR',
          },
        ],
      }) as never,
    );

    await expect(
      provider.fetchChargeStatus({ gatewaySubscriptionId: 'sub_1', gatewayPaymentId: 'cf_1' }),
    ).resolves.toMatchObject({
      state: 'captured',
      amount: '2.00',
      currency: 'INR',
      gatewayOrderId: 'pay_cf',
      gatewayPaymentId: 'cf_1',
    });
  });

  it('reads the subscription payment list when Cashfree returns an array', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse([
        {
          payment_id: 'CH_7520474251355523505',
          cf_payment_id: '1256927478',
          payment_status: 'SUCCESS',
          payment_amount: 2,
          payment_currency: 'INR',
          payment_type: 'AUTH',
        },
      ]) as never,
    );

    await expect(
      provider.fetchChargeStatus({
        gatewaySubscriptionId: 'sub_bc8b4dfe',
        gatewayOrderId: 'CH_7520474251355523505',
        gatewayPaymentId: '1256927478',
      }),
    ).resolves.toMatchObject({
      state: 'captured',
      amount: '2.00',
      currency: 'INR',
      gatewayPaymentId: '1256927478',
    });
  });

  it('uses the only captured first payment when the local row has no Cashfree payment id', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse([
        {
          payment_id: 'CH_1',
          cf_payment_id: '125',
          payment_status: 'SUCCESS',
          payment_amount: 2,
          payment_currency: 'INR',
        },
      ]) as never,
    );

    await expect(
      provider.fetchChargeStatus({
        gatewaySubscriptionId: 'sub_1',
        matchSingleCaptured: true,
      }),
    ).resolves.toMatchObject({ state: 'captured', amount: '2.00', currency: 'INR' });
  });

  it('does not choose an older AUTH payment when the renewal has no payment id', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        payments: [
          {
            payment_id: 'auth_pay',
            cf_payment_id: 'cf_auth',
            payment_status: 'SUCCESS',
            payment_amount: 2,
            payment_currency: 'INR',
            payment_type: 'AUTH',
          },
        ],
      }) as never,
    );

    await expect(
      provider.fetchChargeStatus({ gatewaySubscriptionId: 'sub_1' }),
    ).resolves.toMatchObject({ state: 'unknown' });
  });

  it('falls back to the sole captured CHARGE when stored payment ids do not match Cashfree', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        payments: [
          {
            payment_id: 'CH_real',
            cf_payment_id: '999',
            payment_status: 'SUCCESS',
            payment_amount: 2,
            payment_currency: 'INR',
            payment_type: 'CHARGE',
          },
        ],
      }) as never,
    );

    await expect(
      provider.fetchChargeStatus({
        gatewaySubscriptionId: 'sub_1',
        gatewayOrderId: 'sub:cycle:1:autopay',
        gatewayPaymentId: 'stale-local-id',
      }),
    ).resolves.toMatchObject({
      state: 'captured',
      amount: '2.00',
      currency: 'INR',
      gatewayOrderId: 'CH_real',
      gatewayPaymentId: '999',
    });
  });

  it('does not settle against AUTH when stored ids miss and only AUTH is captured', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        payments: [
          {
            payment_id: 'CH_auth',
            cf_payment_id: '1',
            payment_status: 'SUCCESS',
            payment_amount: 2,
            payment_currency: 'INR',
            payment_type: 'AUTH',
          },
        ],
      }) as never,
    );

    await expect(
      provider.fetchChargeStatus({
        gatewaySubscriptionId: 'sub_1',
        gatewayOrderId: 'wrong-id',
      }),
    ).resolves.toMatchObject({ state: 'unknown' });
  });

  it('picks the sole CHARGE when AUTH and CHARGE are both captured and local ids are missing', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        payments: [
          {
            payment_id: 'auth_pay',
            cf_payment_id: 'cf_auth',
            payment_status: 'SUCCESS',
            payment_amount: 2,
            payment_currency: 'INR',
            payment_type: 'AUTH',
          },
          {
            payment_id: 'CH_charge',
            cf_payment_id: 'cf_charge',
            payment_status: 'SUCCESS',
            payment_amount: 2,
            payment_currency: 'INR',
            payment_type: 'CHARGE',
          },
        ],
      }) as never,
    );

    await expect(
      provider.fetchChargeStatus({ gatewaySubscriptionId: 'sub_1' }),
    ).resolves.toMatchObject({
      state: 'captured',
      gatewayOrderId: 'CH_charge',
      gatewayPaymentId: 'cf_charge',
    });
  });

  it('omits currency when Cashfree does not send payment_currency', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        payments: [
          { payment_id: 'pay_cf', cf_payment_id: 'cf_1', payment_status: 'SUCCESS', payment_amount: 2 },
        ],
      }) as never,
    );

    const snapshot = await provider.fetchChargeStatus({
      gatewaySubscriptionId: 'sub_1',
      gatewayPaymentId: 'cf_1',
    });
    expect(snapshot.currency).toBeUndefined();
    expect(snapshot.state).toBe('captured');
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

  it('sends the storefront subscription return url and a Kolkata card schedule', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({
        subscription_id: 'sub_1',
        subscription_session_id: 'session_1',
        cf_subscription_id: '391',
      }) as never,
    );

    await provider.createAuthorizationSession({
      subscriptionId: '11111111-1111-4111-8111-111111111111',
      userId: 'user-1',
      customer: { name: 'A', email: 'a@example.com', phone: '9999999999' },
      maxAmount: '2500.00',
      authorizationAmount: '2.00',
      currency: 'INR',
      method: 'card',
      notes: { subscriptionPaymentId: 'pay-1' },
      returnUrl: 'https://cureka.example/account/subscriptions/cashfree-return?subscriptionId=11111111-1111-4111-8111-111111111111',
    });
    const createBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const createHeaders = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(createBody.subscription_meta.return_url).toContain('/account/subscriptions/cashfree-return');
    expect(createBody.subscription_meta.return_url).not.toContain('{order_id}');
    expect(createBody.plan_details.plan_type).toBe('ON_DEMAND');
    expect(createBody.plan_details.plan_id).toBeUndefined();
    expect(createBody.plan_id).toBeUndefined();
    expect(createHeaders['x-idempotency-key']).toContain('cf-sub-create:');

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ payment_id: 'pay_cf', payment_status: 'INITIALIZED', cf_payment_id: 'cf_2' }) as never,
    );
    const when = new Date('2026-10-26T12:00:00.000Z');
    await provider.charge({
      gatewaySubscriptionId: 'sub_1',
      gatewayCustomerId: 'cust',
      gatewayMandateId: 'man',
      amount: '2.00',
      receipt: 'receipt-1',
      idempotencyKey: 'sub:1:cycle:1:autopay',
      customer: { phone: '9999999999' },
      notes: {},
      scheduleDate: when,
    });
    const payCall = fetchMock.mock.calls.at(-1);
    const payBody = JSON.parse(String(payCall?.[1]?.body));
    const payHeaders = payCall?.[1]?.headers as Record<string, string>;
    expect(payBody.payment_schedule_date).toBe(formatCashfreeScheduleDate(when));
    expect(payBody.payment_schedule_date.endsWith('+05:30')).toBe(true);
    expect(payBody.payment_schedule_date.endsWith('Z')).toBe(false);
    expect(payHeaders['x-idempotency-key']).toBe('sub:1:cycle:1:autopay');
    expect(payHeaders['x-api-version']).toBe('2023-08-01');
  });

  it('keeps a Cashfree charge timeout pending', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('network timeout'));
    await expect(
      provider.charge({
        gatewaySubscriptionId: 'sub_1',
        gatewayCustomerId: 'cust',
        gatewayMandateId: 'man',
        amount: '2.00',
        receipt: 'receipt-1',
        idempotencyKey: 'idem-1',
        customer: { phone: '9999999999' },
        notes: {},
      }),
    ).resolves.toMatchObject({ accepted: true, pending: true });
  });
});
