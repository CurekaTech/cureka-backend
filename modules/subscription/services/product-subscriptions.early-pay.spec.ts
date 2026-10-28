import { BadRequestException } from '@nestjs/common';
import { ProductSubscriptionFrequency } from '../enums/product-subscription-frequency.enum';
import { ProductSubscriptionStatus } from '../enums/product-subscription-status.enum';
import { SubscriptionBillingCycleStatus } from '../enums/subscription-billing-cycle-status.enum';
import { SubscriptionPaymentAttemptKind } from '../enums/subscription-payment-attempt-kind.enum';
import { SubscriptionPaymentStatus } from '../enums/subscription-payment-status.enum';
import { ProductSubscriptionsService } from './product-subscriptions.service';

describe('Product subscription early payment and reminders', () => {
  const subscriptionsRepository = {
    findById: jest.fn(),
    findByIdAndUserId: jest.fn(),
    findDueForRenewal: jest.fn(),
    updateById: jest.fn(),
  };
  const paymentsService = {
    findById: jest.fn(),
    findBySubscriptionId: jest.fn(),
    upsertPendingCycle: jest.fn(),
    attachCycleMetadata: jest.fn(),
    attachPaymentLink: jest.fn(),
    listReconciling: jest.fn(async () => []),
    listCashfreeAwaitingSettlement: jest.fn(async () => []),
    listStatusBySubscriptionIds: jest.fn(async () => []),
  };
  const ordersService = {
    orderNumbersByIds: jest.fn(async () => new Map()),
  };
  const paymentLinkService = { createPaymentLink: jest.fn() };
  const billingCycleService = {
    findById: jest.fn(),
    findBySubscriptionId: jest.fn(),
    getOrCreate: jest.fn(),
    updateById: jest.fn(),
    latestOrderIdsBySubscription: jest.fn(async () => new Map()),
  };
  const mandateService = {
    canPresentAsAutopay: jest.fn(() => true),
    getForSubscription: jest.fn(),
    resolveChargeProvider: jest.fn(),
    adapter: jest.fn(),
  };
  const notificationsService = {
    sendRenewalReminderEmail: jest.fn(async () => true),
    notifyReminder: jest.fn(),
    notifyRenewalDue: jest.fn(),
  };
  const reminderLogsRepository = {
    findSent: jest.fn(async () => null),
    tryRecordSend: jest.fn(async () => true),
    findBySubscriptionId: jest.fn(async () => []),
  };
  const usersRepository = {
    findById: jest.fn(async () => ({
      firstName: 'A',
      lastName: 'User',
      email: 'a@example.com',
      mobileNumber: '9999999999',
    })),
  };
  const variantsRepository = {
    findById: jest.fn(async () => ({ sellingPrice: '199.00' })),
  };
  const membershipBenefits = { getMemberDiscount: jest.fn(async () => null) };
  const pricingService = {
    calculate: jest.fn(() => ({ finalAmount: '199.00' })),
  };
  const relationLoader = {
    loadProductEntitiesByIds: jest.fn(async () => new Map([['prod-1', { name: 'Widget' }]])),
    loadVariantsByIds: jest.fn(
      async () => new Map([['var-1', { displayName: '500ml', sku: 'SKU-1' }]]),
    ),
    loadUsersByIds: jest.fn(async () => new Map()),
    mapProductSummary: jest.fn(async () => ({ id: 'prod-1', name: 'Widget' })),
  };
  const lockService = {
    withLock: jest.fn(async (_key: string, fn: () => Promise<unknown>) => fn()),
    withDbLock: jest.fn(async (_key: string, fn: () => Promise<unknown>) => fn()),
  };
  const nestConfig = { get: jest.fn() };
  const historyRepository = { append: jest.fn() };

  const service = new ProductSubscriptionsService(
    subscriptionsRepository as never,
    {} as never,
    pricingService as never,
    paymentsService as never,
    paymentLinkService as never,
    notificationsService as never,
    membershipBenefits as never,
    {} as never,
    variantsRepository as never,
    usersRepository as never,
    {} as never,
    relationLoader as never,
    mandateService as never,
    billingCycleService as never,
    lockService as never,
    historyRepository as never,
    nestConfig as never,
    {} as never,
    ordersService as never,
    reminderLogsRepository as never,
  );

  const activeSub = {
    id: 'sub-1',
    refId: 'ups_1',
    userId: 'user-1',
    productId: 'prod-1',
    productVariantId: 'var-1',
    status: ProductSubscriptionStatus.ACTIVE,
    frequency: ProductSubscriptionFrequency.MONTHLY,
    quantity: 1,
    discountType: 'PERCENTAGE',
    discountValue: '10',
    finalAmount: '199.00',
    nextBillingDate: new Date('2026-11-25T18:30:00.000Z'),
    paymentGateway: 'CASHFREE',
    autopayReady: true,
    timezone: 'Asia/Kolkata',
    billingCycleSequence: 1,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    config: { reminderOffsetsJson: [7, 5, 2, 0], deliveryLeadDays: 2, timezone: 'Asia/Kolkata' },
  };

  const scheduledCycle = {
    id: 'cycle-1',
    subscriptionId: 'sub-1',
    billingCycleRef: '2026-11-26',
    status: SubscriptionBillingCycleStatus.SCHEDULED,
    chargeDate: activeSub.nextBillingDate,
    amount: '199.00',
    currency: 'INR',
    paymentId: null as string | null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    lockService.withDbLock.mockImplementation(async (_key: string, fn: () => Promise<unknown>) =>
      fn(),
    );
    subscriptionsRepository.findByIdAndUserId.mockResolvedValue(activeSub);
    subscriptionsRepository.findById.mockResolvedValue(activeSub);
    billingCycleService.findById.mockResolvedValue(scheduledCycle);
    billingCycleService.findBySubscriptionId.mockResolvedValue([scheduledCycle]);
    billingCycleService.getOrCreate.mockResolvedValue(scheduledCycle);
    paymentsService.findBySubscriptionId.mockResolvedValue([]);
    paymentsService.findById.mockResolvedValue(null);
    paymentsService.upsertPendingCycle.mockResolvedValue({
      id: 'pay-1',
      refId: 'spay-1',
      status: SubscriptionPaymentStatus.PENDING,
      billingCycleRef: scheduledCycle.billingCycleRef,
      amount: '199.00',
      currency: 'INR',
      attemptKind: null,
      paymentLink: null,
      gatewayOrderId: null,
    });
    paymentLinkService.createPaymentLink.mockResolvedValue({
      paymentLink: 'https://sandbox.cashfree.com/pg/view/checkout?payment_session_id=sess',
      gatewayOrderId: 'order_cf_early',
      paymentGateway: 'CASHFREE',
      paymentSessionId: 'sess',
      currency: 'INR',
      customer: { name: 'A', email: 'a@example.com', contact: '9999999999' },
    });
    reminderLogsRepository.findSent.mockResolvedValue(null);
    reminderLogsRepository.tryRecordSend.mockResolvedValue(true);
    notificationsService.sendRenewalReminderEmail.mockResolvedValue(true);
  });

  it('creates an early-payment link on the stored Cashfree gateway', async () => {
    const result = await service.payCycle('user-1', 'sub-1', 'cycle-1');
    expect(paymentLinkService.createPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({ preferredGateway: 'CASHFREE' }),
    );
    expect(paymentsService.attachCycleMetadata).toHaveBeenCalledWith(
      'pay-1',
      expect.objectContaining({ attemptKind: SubscriptionPaymentAttemptKind.MANUAL_LINK }),
    );
    expect(result.paymentLink || result.paymentSessionId).toBeTruthy();
  });

  it('reuses an existing early-payment link instead of creating another', async () => {
    const existing = {
      id: 'pay-1',
      refId: 'spay-1',
      status: SubscriptionPaymentStatus.LINK_GENERATED,
      attemptKind: SubscriptionPaymentAttemptKind.MANUAL_LINK,
      paymentLink: 'https://sandbox.cashfree.com/pg/view/checkout?payment_session_id=sess',
      gatewayOrderId: 'order_cf_early',
      paymentGateway: 'CASHFREE',
      currency: 'INR',
      billingCycleRef: scheduledCycle.billingCycleRef,
    };
    paymentsService.findBySubscriptionId.mockResolvedValue([existing]);
    billingCycleService.findById.mockResolvedValue({
      ...scheduledCycle,
      status: SubscriptionBillingCycleStatus.LINK_GENERATED,
      paymentId: 'pay-1',
    });
    paymentsService.findById.mockResolvedValue(existing);

    await service.payCycle('user-1', 'sub-1', 'cycle-1');
    expect(paymentLinkService.createPaymentLink).not.toHaveBeenCalled();
  });

  it('blocks early payment while an AutoPay charge is reconciling', async () => {
    billingCycleService.findById.mockResolvedValue({
      ...scheduledCycle,
      status: SubscriptionBillingCycleStatus.DEBIT_PENDING,
      paymentId: 'pay-1',
    });
    paymentsService.findById.mockResolvedValue({
      id: 'pay-1',
      status: SubscriptionPaymentStatus.RECONCILING,
      attemptKind: SubscriptionPaymentAttemptKind.AUTOPAY,
      gatewayOrderId: 'cf_charge_1',
      billingCycleRef: scheduledCycle.billingCycleRef,
    });

    await expect(service.payCycle('user-1', 'sub-1', 'cycle-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(paymentLinkService.createPaymentLink).not.toHaveBeenCalled();
  });

  it('sends a five-day reminder once with a payment link', async () => {
    subscriptionsRepository.findDueForRenewal.mockResolvedValue([activeSub]);
    const asOf = new Date('2026-11-21T03:30:00.000Z'); // 5 Kolkata days before 26 Nov
    const sent = await service.processReminders(asOf);
    expect(sent).toBe(1);
    expect(paymentLinkService.createPaymentLink).toHaveBeenCalled();
    expect(notificationsService.sendRenewalReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        daysBefore: 5,
        paymentLink: expect.stringContaining('cashfree.com'),
        amount: '199.00',
      }),
    );
    expect(reminderLogsRepository.tryRecordSend).toHaveBeenCalledWith(
      expect.objectContaining({ daysBefore: 5, channel: 'email' }),
    );
  });

  it('does not send a duplicate five-day reminder', async () => {
    subscriptionsRepository.findDueForRenewal.mockResolvedValue([activeSub]);
    reminderLogsRepository.findSent.mockResolvedValue({ id: 'log-1' } as never);
    const sent = await service.processReminders(new Date('2026-11-21T03:30:00.000Z'));
    expect(sent).toBe(0);
    expect(notificationsService.sendRenewalReminderEmail).not.toHaveBeenCalled();
  });

  it('skips reminders for paused subscriptions', async () => {
    subscriptionsRepository.findDueForRenewal.mockResolvedValue([
      { ...activeSub, status: ProductSubscriptionStatus.PAUSED },
    ]);
    const sent = await service.processReminders(new Date('2026-11-21T03:30:00.000Z'));
    expect(sent).toBe(0);
  });

  it('skips reminders when the upcoming cycle is already paid', async () => {
    subscriptionsRepository.findDueForRenewal.mockResolvedValue([activeSub]);
    billingCycleService.getOrCreate.mockResolvedValue({
      ...scheduledCycle,
      status: SubscriptionBillingCycleStatus.PAID,
    });
    const sent = await service.processReminders(new Date('2026-11-21T03:30:00.000Z'));
    expect(sent).toBe(0);
    expect(notificationsService.sendRenewalReminderEmail).not.toHaveBeenCalled();
  });

  it('exposes early-payment eligibility and reminder logs on listCycles', async () => {
    reminderLogsRepository.findBySubscriptionId.mockResolvedValue([
      {
        billingCycleRef: scheduledCycle.billingCycleRef,
        daysBefore: 5,
        channel: 'email',
        sentAt: new Date('2026-11-21T04:00:00.000Z'),
      },
    ] as never);
    paymentsService.findBySubscriptionId.mockResolvedValue([
      {
        id: 'pay-1',
        billingCycleRef: scheduledCycle.billingCycleRef,
        status: SubscriptionPaymentStatus.LINK_GENERATED,
        attemptKind: SubscriptionPaymentAttemptKind.MANUAL_LINK,
        paymentLink: 'https://pay.example/early',
        paymentGateway: 'CASHFREE',
      },
    ]);
    billingCycleService.findBySubscriptionId.mockResolvedValue([
      { ...scheduledCycle, status: SubscriptionBillingCycleStatus.LINK_GENERATED, paymentId: 'pay-1' },
    ]);

    const cycles = await service.listCycles('user-1', 'sub-1');
    expect(cycles[0].earlyPaymentEligible).toBe(true);
    expect(cycles[0].paymentLink).toContain('pay.example');
    expect(cycles[0].reminderLogs).toEqual([
      expect.objectContaining({ daysBefore: 5, channel: 'email' }),
    ]);
  });
});
