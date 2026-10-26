import { ConfigService } from '@nestjs/config';
import { RazorpayRecurringProvider } from './razorpay-recurring.provider';

describe('RazorpayRecurringProvider UPI renewal', () => {
  const provider = new RazorpayRecurringProvider({
    get: (key: string) => (key === 'RAZORPAY_KEY_ID' ? 'rzp_test_key' : 'secret'),
  } as ConfigService);
  const debitAt = new Date(Date.now() + 27 * 60 * 60 * 1000);

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

  it('sends the UPI pre-debit notification and does not debit before payment_after', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ id: 'order_1' }) as never)
      .mockResolvedValueOnce(jsonResponse({ items: [] }) as never);

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
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/payments/create/recurring'))).toBe(false);
    expect(result).toMatchObject({
      accepted: true,
      pending: true,
      gatewayOrderId: 'order_1',
    });
    expect(result.gatewayPaymentId).toBeUndefined();
  });

  it('creates one recurring payment after payment_after and does not create a second one', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ id: 'order_1' }) as never)
      .mockResolvedValueOnce(jsonResponse({ items: [] }) as never)
      .mockResolvedValueOnce(jsonResponse({ items: [] }) as never)
      .mockResolvedValueOnce(jsonResponse({ id: 'pay_1', status: 'created' }) as never);

    const dueAt = new Date(Date.now() - 60_000);
    const result = await provider.charge({
      gatewayCustomerId: 'cust_1',
      gatewayMandateId: 'token_1',
      amount: '2.00',
      receipt: 'spay-cycle-1',
      idempotencyKey: 'local-key-not-sent',
      debitAt: dueAt,
      customer: { email: 'a@example.com', phone: '9000000000' },
      notes: { paymentPurpose: 'PRODUCT_SUBSCRIPTION' },
    });

    const recurringCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes('/payments/create/recurring'),
    );
    expect(recurringCalls).toHaveLength(1);
    expect(result).toMatchObject({
      accepted: true,
      pending: true,
      gatewayOrderId: 'order_1',
      gatewayPaymentId: 'pay_1',
    });

    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({ items: [{ id: 'pay_1', status: 'created', order_id: 'order_1' }] }) as never,
    );
    const again = await provider.submitRecurringDebit({
      gatewayOrderId: 'order_1',
      gatewayCustomerId: 'cust_1',
      gatewayMandateId: 'token_1',
      amount: '2.00',
      receipt: 'spay-cycle-1',
      idempotencyKey: 'local-key-not-sent',
      customer: { email: 'a@example.com', phone: '9000000000' },
      notes: { paymentPurpose: 'PRODUCT_SUBSCRIPTION' },
    });
    expect(again.gatewayPaymentId).toBe('pay_1');
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).includes('/payments/create/recurring')),
    ).toHaveLength(1);
  });

  it('keeps an early notification rejection and an unknown debit reconcilable', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({ error: { description: 'payment_after is invalid' } }, false) as never,
    );
    await expect(
      provider.charge({
        gatewayCustomerId: 'cust_1',
        gatewayMandateId: 'token_1',
        amount: '2.00',
        receipt: 'spay-cycle-1',
        idempotencyKey: 'local-key-not-sent',
        debitAt,
        customer: { email: 'a@example.com', phone: '9000000000' },
        notes: { paymentPurpose: 'PRODUCT_SUBSCRIPTION' },
      }),
    ).resolves.toMatchObject({ accepted: false, pending: false });
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/payments/create/recurring'))).toBe(false);

    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ id: 'order_due' }) as never)
      .mockResolvedValueOnce(jsonResponse({ items: [] }) as never)
      .mockResolvedValueOnce(jsonResponse({ items: [] }) as never)
      .mockRejectedValueOnce(new Error('timeout talking to Razorpay'));
    await expect(
      provider.charge({
        gatewayCustomerId: 'cust_1',
        gatewayMandateId: 'token_1',
        amount: '2.00',
        receipt: 'spay-cycle-due',
        idempotencyKey: 'local-key-not-sent',
        debitAt: new Date(Date.now() - 60_000),
        customer: { email: 'a@example.com', phone: '9000000000' },
        notes: { paymentPurpose: 'PRODUCT_SUBSCRIPTION' },
      }),
    ).resolves.toMatchObject({
      accepted: true,
      pending: true,
      gatewayOrderId: 'order_due',
    });

    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ items: [] }) as never)
      .mockResolvedValueOnce(jsonResponse({ id: 'pay_unknown', status: 'processing' }) as never);
    await expect(
      provider.submitRecurringDebit({
        gatewayOrderId: 'order_due',
        gatewayCustomerId: 'cust_1',
        gatewayMandateId: 'token_1',
        amount: '2.00',
        receipt: 'spay-cycle-due',
        idempotencyKey: 'local-key-not-sent',
        customer: { email: 'a@example.com', phone: '9000000000' },
        notes: { paymentPurpose: 'PRODUCT_SUBSCRIPTION' },
      }),
    ).resolves.toMatchObject({
      accepted: true,
      pending: true,
      gatewayOrderId: 'order_due',
      gatewayPaymentId: 'pay_unknown',
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

  it('does not treat a captured ₹1 registration payment as the product order', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ id: 'pay_auth', status: 'captured', order_id: 'order_auth', amount: 100 }) as never,
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [{ id: 'pay_product', status: 'created', order_id: 'order_product', amount: 200 }],
        }) as never,
      );

    await expect(
      provider.fetchChargeStatus({ gatewayPaymentId: 'pay_auth', gatewayOrderId: 'order_product' }),
    ).resolves.toMatchObject({
      state: 'pending',
      gatewayOrderId: 'order_product',
      gatewayPaymentId: 'pay_product',
      amount: '2.00',
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain('/orders/order_product/payments');
  });

  it('retries one recurring debit when the only payment failed before the scheduled time', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'pay_old', status: 'failed', amount: 200 }] }) as never)
      .mockResolvedValueOnce(jsonResponse({ id: 'pay_new', status: 'created', amount: 200 }) as never);

    const result = await provider.submitRecurringDebit({
      gatewayOrderId: 'order_27h',
      gatewayCustomerId: 'cust_1',
      gatewayMandateId: 'token_1',
      amount: '2.00',
      receipt: 'spay-27h',
      idempotencyKey: 'local-key-not-sent',
      retryFailedPayments: true,
      customer: { email: 'a@example.com', phone: '9000000000' },
      notes: { paymentPurpose: 'PRODUCT_SUBSCRIPTION' },
    });

    expect(fetchMock.mock.calls.filter((call) => String(call[0]).includes('/payments/create/recurring'))).toHaveLength(1);
    expect(result).toMatchObject({ gatewayOrderId: 'order_27h', gatewayPaymentId: 'pay_new', pending: true });

    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({ items: [{ id: 'pay_old', status: 'failed', amount: 200 }] }) as never,
    );
    const kept = await provider.submitRecurringDebit({
      gatewayOrderId: 'order_27h',
      gatewayCustomerId: 'cust_1',
      gatewayMandateId: 'token_1',
      amount: '2.00',
      receipt: 'spay-27h',
      idempotencyKey: 'local-key-not-sent',
      customer: { email: 'a@example.com', phone: '9000000000' },
      notes: { paymentPurpose: 'PRODUCT_SUBSCRIPTION' },
    });
    expect(kept).toMatchObject({ accepted: false, gatewayPaymentId: 'pay_old' });
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).includes('/payments/create/recurring'))).toHaveLength(1);
  });

  it('distinguishes an empty order from an unreadable order without debiting', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({ items: [] }) as never,
    );
    await expect(provider.listOrderCharge('order_empty')).resolves.toEqual({ outcome: 'absent' });
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/payments/create/recurring'))).toBe(false);

    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('timeout talking to Razorpay'));
    await expect(provider.listOrderCharge('order_down')).resolves.toEqual({ outcome: 'unknown' });

    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({ items: [{ id: 'pay_pending', status: 'created', amount: 200 }] }) as never,
    );
    await expect(provider.listOrderCharge('order_pending')).resolves.toMatchObject({
      outcome: 'found',
      snapshot: { state: 'pending', gatewayPaymentId: 'pay_pending', gatewayOrderId: 'order_pending' },
    });
  });

  it('deletes the Razorpay recurring token and treats an already deleted token as cancelled', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ deleted: true }) as never);

    await expect(
      provider.cancelMandate({ gatewayCustomerId: 'cust_1', gatewayMandateId: 'token_1' }),
    ).resolves.toEqual({ cancelled: true });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.razorpay.com/v1/customers/cust_1/tokens/token_1');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE');

    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({ error: { description: 'The token does not exist' } }, false) as never,
    );
    await expect(
      provider.cancelMandate({ gatewayCustomerId: 'cust_1', gatewayMandateId: 'token_1' }),
    ).resolves.toEqual({ cancelled: true });
  });
});
