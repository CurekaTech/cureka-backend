import { SubscriptionPaymentStatus } from '../enums/subscription-payment-status.enum';
import { ProductSubscriptionPaymentsService } from './product-subscription-payments.service';

describe('ProductSubscriptionPaymentsService idempotency', () => {
  const paymentsRepository = {
    findByBillingCycle: jest.fn(),
    updateById: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    existsByRefId: jest.fn(),
    markPaidIfUnpaid: jest.fn(),
    findByGatewayOrderId: jest.fn(),
  };
  const subscriptionsRepository = { findById: jest.fn() };
  const relationLoader = {
    loadProductsByIds: jest.fn(),
    loadVariantsByIds: jest.fn(),
    loadUsersByIds: jest.fn(),
  };

  const service = new ProductSubscriptionPaymentsService(
    paymentsRepository as never,
    subscriptionsRepository as never,
    relationLoader as never,
  );

  it('does not create a second payment row for the same billing cycle', async () => {
    paymentsRepository.findByBillingCycle.mockResolvedValue({
      id: 'pay-1',
      status: SubscriptionPaymentStatus.LINK_GENERATED,
    });
    paymentsRepository.findById.mockResolvedValue({
      id: 'pay-1',
      status: SubscriptionPaymentStatus.LINK_GENERATED,
    });

    const result = await service.upsertPendingCycle({
      subscriptionId: 'sub-1',
      userId: 'user-1',
      billingCycleRef: '2026-09-10',
      amount: '100.00',
      billingDate: new Date('2026-09-10T00:00:00.000Z'),
      actor: 'test',
    });

    expect(paymentsRepository.create).not.toHaveBeenCalled();
    expect(result.id).toBe('pay-1');
  });

  it('skips duplicate paid webhooks', async () => {
    paymentsRepository.findById.mockResolvedValue({
      id: 'pay-1',
      status: SubscriptionPaymentStatus.PAID,
    });
    const result = await service.markPaidIdempotent('pay-1', { actor: 'webhook' });
    expect(result.newlyPaid).toBe(false);
    expect(paymentsRepository.markPaidIfUnpaid).not.toHaveBeenCalled();
  });

  it('marks a cycle paid only once under concurrent callbacks', async () => {
    paymentsRepository.findById
      .mockResolvedValueOnce({ id: 'pay-1', status: SubscriptionPaymentStatus.LINK_GENERATED })
      .mockResolvedValueOnce({ id: 'pay-1', status: SubscriptionPaymentStatus.PAID });
    paymentsRepository.markPaidIfUnpaid.mockResolvedValue(true);
    const first = await service.markPaidIdempotent('pay-1', { actor: 'webhook' });
    expect(first.newlyPaid).toBe(true);

    paymentsRepository.findById.mockResolvedValue({
      id: 'pay-1',
      status: SubscriptionPaymentStatus.PAID,
    });
    const second = await service.markPaidIdempotent('pay-1', { actor: 'redirect' });
    expect(second.newlyPaid).toBe(false);
  });
});
