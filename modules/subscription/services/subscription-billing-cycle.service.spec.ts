import { SubscriptionBillingCycleStatus } from '../enums/subscription-billing-cycle-status.enum';
import { SubscriptionBillingCycleService } from './subscription-billing-cycle.service';

describe('SubscriptionBillingCycleService pricing lock', () => {
  const cyclesRepository = {
    findByBillingCycleRef: jest.fn(),
    updateById: jest.fn(),
    findById: jest.fn(),
    existsByRefId: jest.fn(),
    create: jest.fn(),
  };
  const service = new SubscriptionBillingCycleService(cyclesRepository as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes amount on an unlocked SCHEDULED cycle', async () => {
    cyclesRepository.findByBillingCycleRef.mockResolvedValue({
      id: 'cycle-1',
      status: SubscriptionBillingCycleStatus.SCHEDULED,
      amount: '2000.00',
    });
    cyclesRepository.findById.mockResolvedValue({
      id: 'cycle-1',
      status: SubscriptionBillingCycleStatus.SCHEDULED,
      amount: '2200.00',
      pricingSnapshot: { finalAmount: '2200.00' },
    });

    const cycle = await service.getOrCreate({
      subscriptionId: 'sub-1',
      userId: 'user-1',
      billingCycleRef: '2026-11-20',
      sequence: 2,
      chargeDate: new Date('2026-11-20T00:00:00.000Z'),
      estimatedDeliveryDate: null,
      amount: '2200.00',
      pricingSnapshot: { finalAmount: '2200.00', calculatedAt: '2026-11-13T00:00:00.000Z' },
      actor: 'scheduler',
    });

    expect(cyclesRepository.updateById).toHaveBeenCalledWith(
      'cycle-1',
      expect.objectContaining({ amount: '2200.00' }),
    );
    expect(cycle.amount).toBe('2200.00');
  });

  it('does not change a DEBIT_PENDING snapshot after catalog prices move', async () => {
    cyclesRepository.findByBillingCycleRef.mockResolvedValue({
      id: 'cycle-1',
      status: SubscriptionBillingCycleStatus.DEBIT_PENDING,
      amount: '2200.00',
    });

    const cycle = await service.getOrCreate({
      subscriptionId: 'sub-1',
      userId: 'user-1',
      billingCycleRef: '2026-11-20',
      sequence: 2,
      chargeDate: new Date('2026-11-20T00:00:00.000Z'),
      estimatedDeliveryDate: null,
      amount: '1800.00',
      pricingSnapshot: { finalAmount: '1800.00' },
      actor: 'scheduler',
    });

    expect(cyclesRepository.updateById).not.toHaveBeenCalled();
    expect(cycle.amount).toBe('2200.00');
  });
});
