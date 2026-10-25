import { ConfigService } from '@nestjs/config';
import { RazorpayRecurringProvider } from './razorpay-recurring.provider';

describe('RazorpayRecurringProvider UPI renewal', () => {
  const provider = new RazorpayRecurringProvider({
    get: (key: string) => (key === 'RAZORPAY_KEY_ID' ? 'rzp_test_key' : 'secret'),
  } as ConfigService);
  const debitAt = new Date('2026-10-26T13:05:00.000Z');

  function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
    return {
      ok,
      status,
      json: async () => body,
    };
  }

  beforeEach(() => {
    jest.spyOn(global, 'fetch').mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the UPI pre-debit notification and creates one recurring payment', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ id: 'order_1' }) as never)
      .mockResolvedValueOnce(jsonResponse({ items: [] }) as never)
      .mockResolvedValueOnce(jsonResponse({ id: 'pay_1', status: 'created' }) as never);

    const result = await provider.charge({
      gatewayCustomerId: 'cust_1',
      gatewayMandateId: 'token_1',
      amount: '2.00',
      receipt: 'spay-cycle-1',
      idempotencyKey: 'local-key-not-sent',
      debitAt,
      customer: { email: 'a@example.com', phone: '9000000000' },
      notes: { paymentPurpose: 'PRODUCT_SUBSCRIPTION' },
    });

    const orderCall = fetchMock.mock.calls[0];
    const orderBody = JSON.parse(String(orderCall[1]?.body));
    expect(orderBody.notification).toEqual({
      token_id: 'token_1',
      payment_after: Math.floor(debitAt.getTime() / 1000),
    });
    expect(orderBody.receipt).toBe('spay-cycle-1');
    expect(JSON.stringify(orderCall[1]?.headers)).not.toContain('local-key-not-sent');
    expect(String(fetchMock.mock.calls[2][0])).toContain('/payments/create/recurring');
    expect(result).toMatchObject({
      accepted: true,
      pending: true,
      gatewayOrderId: 'order_1',
      gatewayPaymentId: 'pay_1',
    });
  });

  it('does not create another recurring payment when one is still uncaptured', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          error: { description: 'An order with the same receipt value has already been created' },
        }, false) as never,
      )
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'order_1', receipt: 'spay-cycle-1' }] }) as never)
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'pay_1', status: 'created' }] }) as never);

    const result = await provider.charge({
      gatewayCustomerId: 'cust_1',
      gatewayMandateId: 'token_1',
      amount: '2.00',
      receipt: 'spay-cycle-1',
      idempotencyKey: 'local-key-not-sent',
      debitAt,
      customer: { email: 'a@example.com', phone: '9000000000' },
      notes: { paymentPurpose: 'PRODUCT_SUBSCRIPTION' },
    });

    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/payments/create/recurring'))).toBe(false);
    expect(result).toMatchObject({
      accepted: true,
      pending: true,
      gatewayOrderId: 'order_1',
      gatewayPaymentId: 'pay_1',
    });
  });

  it('reads captured, uncaptured, and unknown payment status without charging', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({ id: 'pay_1', status: 'captured', order_id: 'order_1' }) as never,
    );
    await expect(
      provider.fetchChargeStatus({ gatewayPaymentId: 'pay_1', gatewayOrderId: 'order_1' }),
    ).resolves.toMatchObject({ state: 'captured', gatewayPaymentId: 'pay_1' });

    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({ items: [{ id: 'pay_2', status: 'authorized' }] }) as never,
    );
    await expect(provider.fetchChargeStatus({ gatewayOrderId: 'order_2' })).resolves.toMatchObject({
      state: 'pending',
      gatewayPaymentId: 'pay_2',
    });

    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('network down'));
    await expect(provider.fetchChargeStatus({ gatewayOrderId: 'order_3' })).resolves.toMatchObject({
      state: 'unknown',
      gatewayOrderId: 'order_3',
    });
  });
});
