import { ProductSubscriptionFrequency } from '../enums/product-subscription-frequency.enum';
import { ProductSubscriptionStatus } from '../enums/product-subscription-status.enum';
import { SubscriptionBillingCycleStatus } from '../enums/subscription-billing-cycle-status.enum';
import { SubscriptionMandateProvider } from '../enums/subscription-mandate-provider.enum';
import { SubscriptionPaymentAttemptKind } from '../enums/subscription-payment-attempt-kind.enum';
import { SubscriptionPaymentStatus } from '../enums/subscription-payment-status.enum';
import { RAZORPAY_UPI_LIVE_PREDEBIT_MS, RAZORPAY_UPI_TEST_PREDEBIT_MS } from '../utils/razorpay-upi-debit.util';
import { ProductSubscriptionsService } from './product-subscriptions.service';

describe('Product subscription Razorpay UPI renewal', () => {
  const ordersService = { createOrderFromSubscription: jest.fn() };
  const subscriptionsRepository = {
    findById: jest.fn(),
    findByIdIncludingDeleted: jest.fn(),
    updateById: jest.fn(),
    restoreById: jest.fn(),
  };
  const paymentsService = {
    findById: jest.fn(),
    markPaidIdempotent: jest.fn(),
    markFailed: jest.fn(),
    upsertPendingCycle: jest.fn(),
    attachCycleMetadata: jest.fn(),
    recordProviderCharge: jest.fn(),
    attachPaymentLink: jest.fn(),
    markReconciling: jest.fn(),
  };
  const billingCycleService = {
    findBySubscriptionId: jest.fn(),
    findById: jest.fn(),
    updateById: jest.fn(),
    getOrCreate: jest.fn(),
  };
  const charge = jest.fn();
  const fetchChargeStatus = jest.fn();
  const mandateService = {
    adapter: jest.fn(() => ({ isConfigured: () => true, charge, fetchChargeStatus })),
    resolveChargeProvider: jest.fn(() => SubscriptionMandateProvider.RAZORPAY),
    canPresentAsAutopay: jest.fn(() => true),
    getForSubscription: jest.fn(),
    cardAuthorizationAction: jest.fn(async () => ({ action: 'none' })),
    confirmFromAuthorizationPayment: jest.fn(),
  };
  const usersRepository = { findById: jest.fn() };
  const variantsRepository = { findById: jest.fn() };
  const membershipBenefits = { getMemberDiscount: jest.fn() };
  const pricingService = { calculate: jest.fn() };
  const nestConfig = { get: jest.fn() };
  const notificationsService = { notifyActivated: jest.fn() };
  const historyRepository = { append: jest.fn() };
  const lockService = { withLock: jest.fn(async (_key: string, fn: () => Promise<unknown>) => fn()) };

  const service = new ProductSubscriptionsService(
    subscriptionsRepository as never,
    {} as never,
    pricingService as never,
    paymentsService as never,
    {} as never,
    notificationsService as never,
    membershipBenefits as never,
    {} as never,
    variantsRepository as never,
    usersRepository as never,
    {} as never,
    {} as never,
    mandateService as never,
    billingCycleService as never,
    lockService as never,
    historyRepository as never,
    nestConfig as never,
    {} as never,
    ordersService as never,
  );

  function renew(subscriptionId: string, asOf = new Date()) {
    return (service as unknown as {
      processSingleRenewal: (id: string, asOfDate: Date) => Promise<void>;
    }).processSingleRenewal(subscriptionId, asOf);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mandateService.adapter.mockImplementation(() => ({
      isConfigured: () => true,
      charge,
      fetchChargeStatus,
    }));
    lockService.withLock.mockImplementation(async (_key: string, fn: () => Promise<unknown>) => fn());
    ordersService.createOrderFromSubscription.mockResolvedValue({ id: 'order-row-1' });
    billingCycleService.findById.mockResolvedValue({ id: 'cycle-1', orderId: null });
    nestConfig.get.mockImplementation((key: string) => {
      if (key === 'RAZORPAY_KEY_ID') return 'rzp_live_example';
      if (key === 'subscriptions.testTenuresEnabled') return true;
      return undefined;
    });
  });

  it('records one renewal order when Razorpay capture is verified, then does not charge again', async () => {
    const cycle = {
      id: 'cycle-1',
      paymentId: 'pay-row-1',
      orderId: null as string | null,
      status: SubscriptionBillingCycleStatus.DEBIT_PENDING,
    };
    const payment = {
      id: 'pay-row-1',
      status: SubscriptionPaymentStatus.RECONCILING,
      gatewayOrderId: 'order_1',
      gatewayPaymentId: 'pay_1',
      amount: '2.00',
      billingCycleRef: '2026-10-25T1206Z',
      paymentGateway: 'RAZORPAY',
      billingCycleId: 'cycle-1',
      subscriptionId: 'sub-1',
    };
    const sub = subscription({ status: ProductSubscriptionStatus.ACTIVE });
    subscriptionsRepository.findById.mockResolvedValue(sub);
    billingCycleService.findBySubscriptionId.mockResolvedValue([cycle]);
    paymentsService.findById.mockResolvedValue(payment);
    fetchChargeStatus.mockResolvedValue({
      state: 'captured',
      gatewayOrderId: 'order_1',
      gatewayPaymentId: 'pay_1',
    });
    let paid = false;
    paymentsService.markPaidIdempotent.mockImplementation(async () => {
      const newlyPaid = !paid;
      paid = true;
      payment.status = SubscriptionPaymentStatus.PAID;
      return { payment, newlyPaid };
    });
    billingCycleService.updateById.mockImplementation(async (_id: string, data: { orderId?: string; status?: string }) => {
      if (data.orderId) cycle.orderId = data.orderId;
      if (data.status) cycle.status = data.status as SubscriptionBillingCycleStatus;
    });
    subscriptionsRepository.updateById.mockImplementation(async (_id: string, data: Record<string, unknown>) => {
      Object.assign(sub, data);
    });

    await renew('sub-1');
    await renew('sub-1');

    expect(ordersService.createOrderFromSubscription).toHaveBeenCalledTimes(1);
    expect(charge).not.toHaveBeenCalled();
  });

  it('leaves an uncaptured debit in place and does not create another charge', async () => {
    const cycle = debitCycle();
    subscriptionsRepository.findById.mockResolvedValue(subscription());
    billingCycleService.findBySubscriptionId.mockResolvedValue([cycle]);
    paymentsService.findById.mockResolvedValue(openPayment());
    fetchChargeStatus.mockResolvedValue({ state: 'pending', gatewayOrderId: 'order_1', gatewayPaymentId: 'pay_1' });

    await renew('sub-1');

    expect(charge).not.toHaveBeenCalled();
    expect(ordersService.createOrderFromSubscription).not.toHaveBeenCalled();
    expect(paymentsService.markFailed).not.toHaveBeenCalled();
    expect(cycle.status).toBe(SubscriptionBillingCycleStatus.DEBIT_PENDING);
  });

  it('does not charge again when Razorpay status cannot be read', async () => {
    subscriptionsRepository.findById.mockResolvedValue(subscription());
    billingCycleService.findBySubscriptionId.mockResolvedValue([debitCycle()]);
    paymentsService.findById.mockResolvedValue(openPayment());
    fetchChargeStatus.mockResolvedValue({ state: 'unknown', gatewayOrderId: 'order_1' });

    await renew('sub-1');

    expect(charge).not.toHaveBeenCalled();
    expect(ordersService.createOrderFromSubscription).not.toHaveBeenCalled();
    expect(paymentsService.markPaidIdempotent).not.toHaveBeenCalled();
  });

  it('does not charge or create an order when the subscription is cancelled during an uncaptured debit', async () => {
    subscriptionsRepository.findById.mockResolvedValue(
      subscription({ status: ProductSubscriptionStatus.CANCELLED }),
    );
    billingCycleService.findBySubscriptionId.mockResolvedValue([debitCycle()]);
    paymentsService.findById.mockResolvedValue(openPayment());
    fetchChargeStatus.mockResolvedValue({ state: 'pending', gatewayPaymentId: 'pay_1' });

    await renew('sub-1');

    expect(charge).not.toHaveBeenCalled();
    expect(ordersService.createOrderFromSubscription).not.toHaveBeenCalled();
    expect(subscriptionsRepository.updateById).not.toHaveBeenCalled();
  });

  it('does not send a second Razorpay debit after a verified failure', async () => {
    const failed = {
      ...debitCycle(),
      status: SubscriptionBillingCycleStatus.FAILED,
    };
    subscriptionsRepository.findById.mockResolvedValue(subscription());
    billingCycleService.findBySubscriptionId.mockResolvedValue([failed]);
    billingCycleService.getOrCreate.mockResolvedValue(failed);
    paymentsService.findById.mockResolvedValue({
      ...openPayment(),
      status: SubscriptionPaymentStatus.FAILED,
      attemptKind: SubscriptionPaymentAttemptKind.AUTOPAY,
    });
    variantsRepository.findById.mockResolvedValue({ sellingPrice: '2.00' });
    membershipBenefits.getMemberDiscount.mockResolvedValue(null);
    pricingService.calculate.mockReturnValue({ finalAmount: '2.00' });

    await renew('sub-1');

    expect(charge).not.toHaveBeenCalled();
  });

  it('schedules a live UPI renewal at least 25 hours ahead, even for a 5-minute tenure', async () => {
    const cycle = {
      id: 'cycle-new',
      status: SubscriptionBillingCycleStatus.SCHEDULED,
      paymentId: null,
      orderId: null,
    };
    subscriptionsRepository.findById.mockResolvedValue(
      subscription({ frequency: ProductSubscriptionFrequency.MINUTES_5 }),
    );
    billingCycleService.findBySubscriptionId.mockResolvedValue([]);
    billingCycleService.getOrCreate.mockResolvedValue(cycle);
    variantsRepository.findById.mockResolvedValue({ sellingPrice: '2.00' });
    membershipBenefits.getMemberDiscount.mockResolvedValue(null);
    pricingService.calculate.mockReturnValue({ finalAmount: '2.00' });
    mandateService.getForSubscription.mockResolvedValue({
      id: 'man-1',
      provider: SubscriptionMandateProvider.RAZORPAY,
      gatewayCustomerId: 'cust_1',
      gatewayMandateId: 'token_1',
      maxAmount: '2500.00',
      consentEvidence: { method: 'upi' },
    });
    usersRepository.findById.mockResolvedValue({ email: 'a@example.com', mobileNumber: '9000000000' });
    paymentsService.upsertPendingCycle.mockResolvedValue({ id: 'pay-row-1', refId: 'spay-1' });
    charge.mockResolvedValue({
      accepted: true,
      pending: true,
      gatewayOrderId: 'order_2',
      gatewayPaymentId: 'pay_2',
    });

    const before = Date.now();
    await renew('sub-1');

    expect(charge).toHaveBeenCalledTimes(1);
    const debitAt = charge.mock.calls[0][0].debitAt as Date;
    expect(debitAt.getTime() - before).toBeGreaterThanOrEqual(RAZORPAY_UPI_LIVE_PREDEBIT_MS - 1000);
    expect(charge.mock.calls[0][0].idempotencyKey).toContain('sub-1');
    expect(ordersService.createOrderFromSubscription).not.toHaveBeenCalled();
  });

  it('uses the short pre-debit window only for a test key', async () => {
    nestConfig.get.mockImplementation((key: string) => {
      if (key === 'RAZORPAY_KEY_ID') return 'rzp_test_example';
      if (key === 'subscriptions.testTenuresEnabled') return true;
      return undefined;
    });
    subscriptionsRepository.findById.mockResolvedValue(
      subscription({ frequency: ProductSubscriptionFrequency.MINUTES_5 }),
    );
    billingCycleService.findBySubscriptionId.mockResolvedValue([]);
    billingCycleService.getOrCreate.mockResolvedValue({
      id: 'cycle-new',
      status: SubscriptionBillingCycleStatus.SCHEDULED,
      paymentId: null,
    });
    variantsRepository.findById.mockResolvedValue({ sellingPrice: '2.00' });
    membershipBenefits.getMemberDiscount.mockResolvedValue(null);
    pricingService.calculate.mockReturnValue({ finalAmount: '2.00' });
    mandateService.getForSubscription.mockResolvedValue({
      id: 'man-1',
      provider: SubscriptionMandateProvider.RAZORPAY,
      gatewayCustomerId: 'cust_1',
      gatewayMandateId: 'token_1',
      maxAmount: '2500.00',
      consentEvidence: { method: 'upi' },
    });
    usersRepository.findById.mockResolvedValue({ email: 'a@example.com', mobileNumber: '9000000000' });
    paymentsService.upsertPendingCycle.mockResolvedValue({ id: 'pay-row-1', refId: 'spay-1' });
    charge.mockResolvedValue({ accepted: true, pending: true, gatewayOrderId: 'order_2' });

    const before = Date.now();
    await renew('sub-1');
    const debitAt = charge.mock.calls[0][0].debitAt as Date;
    expect(debitAt.getTime() - before).toBeGreaterThanOrEqual(RAZORPAY_UPI_TEST_PREDEBIT_MS - 1000);
    expect(debitAt.getTime() - before).toBeLessThan(10 * 60 * 1000);
  });

  it('creates one renewal order when the captured webhook is delivered twice', async () => {
    const payment = {
      id: 'pay-row-1',
      status: SubscriptionPaymentStatus.RECONCILING,
      gatewayOrderId: 'order_1',
      gatewayPaymentId: 'pay_1',
      amount: '2.00',
      billingCycleRef: '2026-10-25T1206Z',
      paymentGateway: 'RAZORPAY',
      billingCycleId: 'cycle-1',
      subscriptionId: 'sub-1',
    };
    subscriptionsRepository.findById.mockResolvedValue(subscription({ status: ProductSubscriptionStatus.ACTIVE }));
    let paid = false;
    paymentsService.findById.mockImplementation(async () => payment);
    paymentsService.markPaidIdempotent.mockImplementation(async () => {
      const newlyPaid = !paid;
      paid = true;
      payment.status = SubscriptionPaymentStatus.PAID;
      return { payment, newlyPaid };
    });

    await service.handlePaymentSuccess({
      paymentId: payment.id,
      gatewayOrderId: 'order_1',
      gatewayPaymentId: 'pay_1',
      actor: 'razorpay-webhook',
    });
    await service.handlePaymentSuccess({
      paymentId: payment.id,
      gatewayOrderId: 'order_1',
      gatewayPaymentId: 'pay_1',
      actor: 'razorpay-webhook',
    });

    expect(ordersService.createOrderFromSubscription).toHaveBeenCalledTimes(1);
  });
});

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    userId: 'user-1',
    productId: 'product-1',
    productVariantId: 'variant-1',
    addressId: 'address-1',
    refId: 'ups-1',
    quantity: 1,
    frequency: ProductSubscriptionFrequency.MONTHLY,
    status: ProductSubscriptionStatus.ACTIVE,
    nextBillingDate: new Date(Date.now() - 60_000),
    timezone: 'Asia/Kolkata',
    scheduleAnchorDay: 25,
    billingCycleSequence: 1,
    paymentGateway: 'RAZORPAY',
    autopayReady: true,
    config: { deliveryLeadDays: 2 },
    ...overrides,
  };
}

function debitCycle() {
  return {
    id: 'cycle-1',
    paymentId: 'pay-row-1',
    orderId: null as string | null,
    status: SubscriptionBillingCycleStatus.DEBIT_PENDING,
  };
}

function openPayment() {
  return {
    id: 'pay-row-1',
    status: SubscriptionPaymentStatus.RECONCILING,
    gatewayOrderId: 'order_1',
    gatewayPaymentId: 'pay_1',
    amount: '2.00',
    billingCycleRef: '2026-10-25T1206Z',
    paymentGateway: 'RAZORPAY',
    billingCycleId: 'cycle-1',
    attemptKind: SubscriptionPaymentAttemptKind.AUTOPAY,
  };
}
