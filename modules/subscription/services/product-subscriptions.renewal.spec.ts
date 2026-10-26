import { ProductSubscriptionFrequency } from '../enums/product-subscription-frequency.enum';
import { ProductSubscriptionStatus } from '../enums/product-subscription-status.enum';
import { SubscriptionBillingCycleStatus } from '../enums/subscription-billing-cycle-status.enum';
import { SubscriptionMandateProvider } from '../enums/subscription-mandate-provider.enum';
import { SubscriptionPaymentAttemptKind } from '../enums/subscription-payment-attempt-kind.enum';
import { SubscriptionPaymentStatus } from '../enums/subscription-payment-status.enum';
import { buildBillingCycleRef } from '../utils/billing-cycle-ref.util';
import { RAZORPAY_UPI_LIVE_PREDEBIT_MS, RAZORPAY_UPI_TEST_PREDEBIT_MS } from '../utils/razorpay-upi-debit.util';
import { ProductSubscriptionsService } from './product-subscriptions.service';

describe('Product subscription Razorpay UPI renewal', () => {
  const ordersService = {
    createOrderFromSubscription: jest.fn(),
    orderNumbersByIds: jest.fn(async () => new Map<string, string>()),
  };
  const subscriptionsRepository = {
    findById: jest.fn(),
    findByIdAndUserId: jest.fn(),
    findByIdIncludingDeleted: jest.fn(),
    updateById: jest.fn(),
    restoreById: jest.fn(),
  };
  const paymentsService = {
    findById: jest.fn(),
    findBySubscriptionId: jest.fn(),
    listReconciling: jest.fn(),
    markPaidIdempotent: jest.fn(),
    markFailed: jest.fn(),
    upsertPendingCycle: jest.fn(),
    attachCycleMetadata: jest.fn(),
    recordProviderCharge: jest.fn(),
    attachPaymentLink: jest.fn(),
    markReconciling: jest.fn(),
    claimChargeInitiation: jest.fn(),
    claimRetry: jest.fn(),
    releaseChargeInitiation: jest.fn(),
    attachOrderId: jest.fn(),
    listStatusBySubscriptionIds: jest.fn(async () => []),
    findByGatewayOrderId: jest.fn(),
  };
  const paymentLinkService = { createPaymentLink: jest.fn() };
  const billingCycleService = {
    findBySubscriptionId: jest.fn(),
    findById: jest.fn(),
    updateById: jest.fn(),
    getOrCreate: jest.fn(),
    claimStatus: jest.fn(async () => true),
    claimDebitRetry: jest.fn(async () => false),
    latestOrderIdsBySubscription: jest.fn(async () => new Map<string, string>()),
  };
  const charge = jest.fn();
  const submitRecurringDebit = jest.fn();
  const fetchChargeStatus = jest.fn();
  const listOrderCharge = jest.fn(async (): Promise<{ outcome: string; snapshot?: { state: string; gatewayPaymentId?: string } }> => ({
    outcome: 'unknown',
  }));
  const mandateService = {
    adapter: jest.fn((_provider: SubscriptionMandateProvider) => ({
      isConfigured: () => true,
      charge,
      submitRecurringDebit,
      fetchChargeStatus,
      listOrderCharge,
    resolveChargeProvider: jest.fn(() => SubscriptionMandateProvider.RAZORPAY),
    canPresentAsAutopay: jest.fn(() => true),
    getForSubscription: jest.fn(),
    cardAuthorizationAction: jest.fn(
      async (): Promise<{ action: string; mandate?: { id: string } }> => ({ action: 'none' }),
    ),
    confirmFromAuthorizationPayment: jest.fn(),
    chargeCardProduct: jest.fn(),
    findByGatewayMandateId: jest.fn(),
  };
    revokeForSubscription: jest.fn(),
  };
  const usersRepository = { findById: jest.fn() };
  const variantsRepository = { findById: jest.fn() };
  const membershipBenefits = { getMemberDiscount: jest.fn() };
  const pricingService = { calculate: jest.fn() };
  const nestConfig = { get: jest.fn() };
  const notificationsService = {
    notifyActivated: jest.fn(),
    notifyPaymentLinkCreated: jest.fn(),
    notifyCancelled: jest.fn(),
  const historyRepository = { append: jest.fn() };
  const relationLoader = {
    loadUsersByIds: jest.fn().mockResolvedValue(new Map()),
    loadProductEntitiesByIds: jest.fn().mockResolvedValue(new Map()),
    loadVariantsByIds: jest.fn().mockResolvedValue(new Map()),
    mapProductSummary: jest.fn().mockResolvedValue(null),
  };
  const lockService = {
    withLock: jest.fn(async (_key: string, fn: () => Promise<unknown>) => fn()),
    withDbLock: jest.fn(async (_key: string, fn: () => Promise<unknown>) => fn()),
  };

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
  );

  function renew(subscriptionId: string, asOf = new Date()) {
    return (service as unknown as {
      processSingleRenewal: (id: string, asOfDate: Date) => Promise<void>;
    }).processSingleRenewal(subscriptionId, asOf);
  }

  beforeEach(() => {
  function cycleUpdates(id: string): string[] {
    return billingCycleService.updateById.mock.calls
      .filter((call: [string, { status?: string }]) => call[0] === id)
      .map((call: [string, { status?: string }]) => call[1]?.status)
      .filter((status: string | undefined): status is string => Boolean(status));
  }

  function upiMandate() {
    return {
      id: 'man-1',
      provider: SubscriptionMandateProvider.RAZORPAY,
      gatewayCustomerId: 'cust_1',
      gatewayMandateId: 'token_1',
      maxAmount: '2500.00',
      consentEvidence: { method: 'upi' },
    };
  }

  function notifiedCycle(debitAt: Date) {
    return {
      id: 'cycle-27h',
      status: SubscriptionBillingCycleStatus.NOTIFICATION_SENT,
      paymentId: 'pay-row-1',
      chargeDate: debitAt,
      debitEarliestAt: debitAt,
      billingCycleRef: '2026-10-26T2205Z',
    };
  }

  function notifiedPayment() {
    return {
      id: 'pay-row-1',
      gatewayOrderId: 'order_27h',
      gatewayPaymentId: null,
      amount: '2.00',
      refId: 'spay-27h',
      billingCycleRef: '2026-10-26T2205Z',
      status: SubscriptionPaymentStatus.RECONCILING,
      subscriptionId: 'sub-1',
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mandateService.adapter.mockImplementation(() => ({
      isConfigured: () => true,
      charge,
      submitRecurringDebit,
      fetchChargeStatus,
      listOrderCharge,
    }));
    lockService.withLock.mockImplementation(async (_key: string, fn: () => Promise<unknown>) => fn());
    lockService.withDbLock.mockImplementation(async (_key: string, fn: () => Promise<unknown>) => fn());
    billingCycleService.claimStatus.mockResolvedValue(true);
    billingCycleService.claimDebitRetry.mockResolvedValue(false);
    fetchChargeStatus.mockReset();
    fetchChargeStatus.mockResolvedValue({ state: 'unknown' });
    listOrderCharge.mockReset();
    listOrderCharge.mockResolvedValue({ outcome: 'unknown' });
    submitRecurringDebit.mockReset();
    paymentsService.listReconciling.mockResolvedValue([]);
    paymentsService.claimChargeInitiation.mockResolvedValue(true);
    paymentsService.claimRetry.mockResolvedValue(true);
    paymentsService.releaseChargeInitiation.mockResolvedValue(true);
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

  it('does not create an order when the captured payment is only the ₹1 registration', async () => {
    const cycle = debitCycle();
    subscriptionsRepository.findById.mockResolvedValue(subscription());
    billingCycleService.findBySubscriptionId.mockResolvedValue([cycle]);
    paymentsService.findById.mockResolvedValue(openPayment());
    fetchChargeStatus.mockResolvedValue({
      state: 'captured',
      amount: '1.00',
      gatewayOrderId: 'order_1',
      gatewayPaymentId: 'pay_auth',
    });

    await renew('sub-1');

    expect(ordersService.createOrderFromSubscription).not.toHaveBeenCalled();
    expect(paymentsService.markPaidIdempotent).not.toHaveBeenCalled();
    expect(charge).not.toHaveBeenCalled();
  });

  it('does not mark the subscription paid when card registration is waiting for the product charge', async () => {
    mandateService.cardAuthorizationAction.mockResolvedValueOnce({ action: 'wait' });
    paymentsService.findById.mockResolvedValue({
      id: 'pay-row-1',
      amount: '2.00',
      subscriptionId: 'sub-1',
      status: SubscriptionPaymentStatus.LINK_GENERATED,
    });

    await service.handlePaymentSuccess({
      paymentId: 'pay-row-1',
      gatewayOrderId: 'order_auth',
      gatewayPaymentId: 'pay_auth',
      actor: 'webhook',
    });

    expect(paymentsService.markPaidIdempotent).not.toHaveBeenCalled();
    expect(ordersService.createOrderFromSubscription).not.toHaveBeenCalled();
  });

  it('does not create an order while the card product charge is still pending', async () => {
    mandateService.cardAuthorizationAction.mockResolvedValueOnce({
      action: 'charge',
      mandate: { id: 'man-1' },
    });
    usersRepository.findById.mockResolvedValue({ email: 'a@example.com', mobileNumber: '9000000000' });
    mandateService.chargeCardProduct.mockResolvedValue({
      accepted: true,
      pending: true,
      gatewayOrderId: 'order_product',
      gatewayPaymentId: 'pay_product',
    });
    paymentsService.findById.mockResolvedValue({
      id: 'pay-row-1',
      amount: '2.00',
      userId: 'user-1',
      subscriptionId: 'sub-1',
      billingCycleRef: '2026-10-25T1206Z',
      status: SubscriptionPaymentStatus.LINK_GENERATED,
    });

    await service.handlePaymentSuccess({
      paymentId: 'pay-row-1',
      gatewayOrderId: 'order_auth',
      actor: 'webhook',
    });

    expect(paymentsService.recordProviderCharge).toHaveBeenCalledWith(
      'pay-row-1',
      expect.objectContaining({ gatewayOrderId: 'order_product', pending: true }),
    );
    expect(paymentsService.markPaidIdempotent).not.toHaveBeenCalled();
    expect(ordersService.createOrderFromSubscription).not.toHaveBeenCalled();
  });

  it('does not start a second payment while the product charge is reconciling', async () => {
    subscriptionsRepository.findByIdAndUserId.mockResolvedValue(
      subscription({ status: ProductSubscriptionStatus.PENDING_PAYMENT }),
    );
    paymentsService.listReconciling.mockResolvedValue([
      {
        id: 'pay-row-1',
        status: SubscriptionPaymentStatus.RECONCILING,
        gatewayOrderId: 'order_product',
        gatewayPaymentId: 'pay_product',
        amount: '2.00',
        paymentGateway: 'RAZORPAY',
      },
    ]);
    paymentsService.findBySubscriptionId.mockResolvedValue([
      { id: 'pay-row-1', status: SubscriptionPaymentStatus.RECONCILING, amount: '2.00' },
    ]);
    fetchChargeStatus.mockResolvedValue({
      state: 'pending',
      amount: '2.00',
      gatewayOrderId: 'order_product',
      gatewayPaymentId: 'pay_product',
    });

    await expect(service.retryPayment('user-1', 'sub-1')).rejects.toThrow(/already being confirmed/);
    expect(paymentLinkService.createPaymentLink).not.toHaveBeenCalled();
    expect(charge).not.toHaveBeenCalled();
  });

  it('does not report the subscription paid when Razorpay has only captured the ₹1 registration', async () => {
    subscriptionsRepository.findByIdAndUserId.mockResolvedValue(
      subscription({ status: ProductSubscriptionStatus.PENDING_PAYMENT, autopayReady: true }),
    );
    paymentsService.findBySubscriptionId.mockResolvedValue([
      {
        id: 'pay-row-1',
        status: SubscriptionPaymentStatus.LINK_GENERATED,
        gatewayOrderId: 'order_auth',
        gatewayPaymentId: 'pay_auth',
        amount: '2.00',
      },
    ]);
    paymentsService.findById.mockResolvedValue({
      id: 'pay-row-1',
      status: SubscriptionPaymentStatus.LINK_GENERATED,
      amount: '2.00',
      subscriptionId: 'sub-1',
      userId: 'user-1',
      billingCycleRef: '2026-10-25T1206Z',
    });
    fetchChargeStatus.mockResolvedValue({
      state: 'captured',
      amount: '1.00',
      gatewayOrderId: 'order_auth',
      gatewayPaymentId: 'pay_auth',
    });
    mandateService.cardAuthorizationAction.mockResolvedValueOnce({ action: 'wait' });

    await expect(service.syncRazorpayPayment('user-1', 'sub-1')).resolves.toEqual({ paid: false });
    expect(paymentsService.markPaidIdempotent).not.toHaveBeenCalled();
    expect(ordersService.createOrderFromSubscription).not.toHaveBeenCalled();
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

  it('does not create an order when Cashfree reports the subscription active without a matching payment', async () => {
    const cashfreeFetch = jest.fn().mockResolvedValue({ state: 'unknown' });
    mandateService.adapter.mockImplementation((provider: SubscriptionMandateProvider) =>
      provider === SubscriptionMandateProvider.CASHFREE
        ? { isConfigured: () => true, fetchChargeStatus: cashfreeFetch, charge, submitRecurringDebit, listOrderCharge }
        : { isConfigured: () => true, charge, submitRecurringDebit, fetchChargeStatus, listOrderCharge },
    );
    paymentsService.findById.mockResolvedValue({
      id: 'pay-row-1',
      status: SubscriptionPaymentStatus.LINK_GENERATED,
      amount: '2.00',
      subscriptionId: 'sub-1',
      gatewayOrderId: 'sub_sub-1',
    });
    mandateService.getForSubscription.mockResolvedValue({
      authorizationOrderId: 'sub_sub-1',
      gatewaySubscriptionId: 'sub_sub-1',
    });

    await expect(
      service.settleCashfreeSubscriptionPayment({
        paymentId: 'pay-row-1',
        gatewaySubscriptionId: 'sub_sub-1',
        actor: 'cashfree-webhook',
      }),
    ).resolves.toBe(false);
    expect(ordersService.createOrderFromSubscription).not.toHaveBeenCalled();
  });

  it('creates one order when the Cashfree payment is captured for the product amount', async () => {
    const cashfreeFetch = jest.fn().mockResolvedValue({
      state: 'captured',
      amount: '2.00',
      gatewayOrderId: 'cf_payment_1',
      gatewayPaymentId: 'cf_1',
    });
    mandateService.adapter.mockImplementation((provider: SubscriptionMandateProvider) =>
      provider === SubscriptionMandateProvider.CASHFREE
        ? { isConfigured: () => true, fetchChargeStatus: cashfreeFetch, charge, submitRecurringDebit, listOrderCharge }
        : { isConfigured: () => true, charge, submitRecurringDebit, fetchChargeStatus, listOrderCharge },
    );
    const payment = {
      id: 'pay-row-1',
      status: SubscriptionPaymentStatus.LINK_GENERATED,
      amount: '2.00',
      subscriptionId: 'sub-1',
      billingCycleRef: '2026-10-25',
      paymentGateway: 'CASHFREE',
      gatewayOrderId: 'sub_sub-1',
    };
    paymentsService.findById.mockResolvedValue(payment);
    paymentsService.markPaidIdempotent.mockResolvedValue({
      payment: { ...payment, status: SubscriptionPaymentStatus.PAID },
      newlyPaid: true,
    });
    subscriptionsRepository.findById.mockResolvedValue(
      subscription({ status: ProductSubscriptionStatus.PENDING_PAYMENT }),
    );
    mandateService.getForSubscription.mockResolvedValue({ authorizationOrderId: 'sub_sub-1' });

    await expect(
      service.settleCashfreeSubscriptionPayment({
        paymentId: 'pay-row-1',
        gatewaySubscriptionId: 'sub_sub-1',
        actor: 'cashfree-webhook',
      }),
    ).resolves.toBe(true);
    expect(ordersService.createOrderFromSubscription).toHaveBeenCalledTimes(1);

    paymentsService.findById.mockResolvedValue({ ...payment, status: SubscriptionPaymentStatus.PAID });
    await service.settleCashfreeSubscriptionPayment({
      paymentId: 'pay-row-1',
      gatewaySubscriptionId: 'sub_sub-1',
      actor: 'cashfree-webhook',
    });
    expect(ordersService.createOrderFromSubscription).toHaveBeenCalledTimes(1);
  });

  it('records a retryable failure when Razorpay rejects the product charge before an order exists', async () => {
    mandateService.findByGatewayMandateId.mockResolvedValue(cardMandate());
    paymentsService.findById.mockResolvedValue(openCardPayment());
    mandateService.chargeCardProduct.mockResolvedValue({
      accepted: false,
      pending: false,
      failureReason: 'The card was declined',
    });

    await service.collectCardProductAfterTokenConfirmed('token_1');

    expect(mandateService.chargeCardProduct).toHaveBeenCalledTimes(1);
    expect(paymentsService.markFailed).toHaveBeenCalledWith(
      'pay-row-1',
      'The card was declined',
      'razorpay-webhook',
    );
    expect(ordersService.createOrderFromSubscription).not.toHaveBeenCalled();

    paymentsService.findById.mockResolvedValue({
      ...openCardPayment(),
      status: SubscriptionPaymentStatus.FAILED,
    });
    await service.collectCardProductAfterTokenConfirmed('token_1');
    expect(mandateService.chargeCardProduct).toHaveBeenCalledTimes(1);
  });

  it('does not start another product charge when the first result is an unknown timeout', async () => {
    mandateService.findByGatewayMandateId.mockResolvedValue(cardMandate());
    paymentsService.findById.mockResolvedValue(openCardPayment());
    mandateService.chargeCardProduct.mockResolvedValue({
      accepted: true,
      pending: true,
      failureReason: 'timeout',
    });

    await service.collectCardProductAfterTokenConfirmed('token_1');
    paymentsService.findById.mockResolvedValue({
      ...openCardPayment(),
      status: SubscriptionPaymentStatus.RECONCILING,
    });
    await service.collectCardProductAfterTokenConfirmed('token_1');

    expect(mandateService.chargeCardProduct).toHaveBeenCalledTimes(1);
    expect(paymentsService.markFailed).not.toHaveBeenCalled();
    expect(ordersService.createOrderFromSubscription).not.toHaveBeenCalled();
  });

  it('starts at most one product charge when token.confirmed is delivered twice together', async () => {
    let claims = 0;
    paymentsService.claimChargeInitiation.mockImplementation(async () => {
      claims += 1;
      return claims === 1;
    });
    lockService.withDbLock.mockImplementation(serializedLock());
    mandateService.findByGatewayMandateId.mockResolvedValue(cardMandate());
    paymentsService.findById.mockResolvedValue(openCardPayment());
    mandateService.chargeCardProduct.mockResolvedValue({
      accepted: true,
      pending: true,
      gatewayOrderId: 'order_product',
      gatewayPaymentId: 'pay_product',
    });

    await Promise.all([
      service.collectCardProductAfterTokenConfirmed('token_1'),
      service.collectCardProductAfterTokenConfirmed('token_1'),
    ]);

    expect(mandateService.chargeCardProduct).toHaveBeenCalledTimes(1);
    expect(ordersService.createOrderFromSubscription).not.toHaveBeenCalled();
  });

  it('creates one retry link after a definitive failure and returns that link to a second request', async () => {
    const state = {
      status: SubscriptionPaymentStatus.FAILED as SubscriptionPaymentStatus,
      paymentLink: null as string | null,
      gatewayOrderId: 'order_auth',
    };
    lockService.withDbLock.mockImplementation(serializedLock());
    subscriptionsRepository.findByIdAndUserId.mockResolvedValue(
      subscription({ status: ProductSubscriptionStatus.PENDING_PAYMENT, autopayReady: true }),
    );
    paymentsService.listReconciling.mockResolvedValue([]);
    paymentsService.findBySubscriptionId.mockImplementation(async () => [retryRow(state)]);
    paymentsService.claimRetry.mockImplementation(async () => {
      if (state.status !== SubscriptionPaymentStatus.FAILED) return false;
      state.status = SubscriptionPaymentStatus.RECONCILING;
      return true;
    });
    paymentsService.attachPaymentLink.mockImplementation(async () => {
      state.status = SubscriptionPaymentStatus.LINK_GENERATED;
      state.paymentLink = 'https://pay.example/retry';
      state.gatewayOrderId = 'order_retry';
    });
    mandateService.getForSubscription.mockResolvedValue({
      authorizationOrderId: 'order_auth',
      consentEvidence: { cardAuthOnly: true },
    });
    paymentLinkService.createPaymentLink.mockResolvedValue({
      paymentLink: 'https://pay.example/retry',
      gatewayOrderId: 'order_retry',
      paymentGateway: 'RAZORPAY',
      currency: 'INR',
    });

    await Promise.all([
      service.retryPayment('user-1', 'sub-1'),
      service.retryPayment('user-1', 'sub-1'),
    ]);

    expect(paymentLinkService.createPaymentLink).toHaveBeenCalledTimes(1);
    expect(ordersService.createOrderFromSubscription).not.toHaveBeenCalled();
  });

  it('does not create a retry link while the product charge is unknown, then one capture creates one order', async () => {
    subscriptionsRepository.findByIdAndUserId.mockResolvedValue(
      subscription({ status: ProductSubscriptionStatus.PENDING_PAYMENT, autopayReady: true }),
    );
    subscriptionsRepository.findById.mockResolvedValue(
      subscription({ status: ProductSubscriptionStatus.PENDING_PAYMENT }),
    );
    const payment = {
      ...openCardPayment(),
      status: SubscriptionPaymentStatus.RECONCILING,
      gatewayOrderId: 'order_product',
      gatewayPaymentId: 'pay_product',
    };
    paymentsService.listReconciling.mockResolvedValue([payment]);
    paymentsService.findBySubscriptionId.mockResolvedValue([payment]);
    paymentsService.findById.mockResolvedValue(payment);
    mandateService.getForSubscription.mockResolvedValue({
      authorizationOrderId: 'order_auth',
      consentEvidence: { cardAuthOnly: true },
    });
    fetchChargeStatus.mockResolvedValue({
      state: 'unknown',
      gatewayOrderId: 'order_product',
      gatewayPaymentId: 'pay_product',
    });

    await expect(service.retryPayment('user-1', 'sub-1')).rejects.toThrow(/already being confirmed/);
    expect(paymentLinkService.createPaymentLink).not.toHaveBeenCalled();

    paymentsService.markPaidIdempotent.mockResolvedValue({
      payment: { ...payment, status: SubscriptionPaymentStatus.PAID },
      newlyPaid: true,
    });
    fetchChargeStatus.mockResolvedValue({
      state: 'captured',
      amount: '2.00',
      gatewayOrderId: 'order_product',
      gatewayPaymentId: 'pay_product',
    });
    await service.handlePaymentSuccess({
      paymentId: payment.id,
      gatewayOrderId: 'order_product',
      gatewayPaymentId: 'pay_product',
      actor: 'razorpay-webhook',
    });
    expect(ordersService.createOrderFromSubscription).toHaveBeenCalledTimes(1);
  });

  it('does not fail the product payment when the card token is not confirmed yet', async () => {
    mandateService.findByGatewayMandateId.mockResolvedValue(cardMandate());
    paymentsService.findById.mockResolvedValue(openCardPayment());
    mandateService.chargeCardProduct.mockResolvedValue({
      accepted: false,
      pending: true,
      failureReason: 'Card token is not confirmed yet',
    });

    await service.collectCardProductAfterTokenConfirmed('token_1');

    expect(paymentsService.releaseChargeInitiation).toHaveBeenCalledWith('pay-row-1', 'razorpay-webhook');
    expect(paymentsService.markFailed).not.toHaveBeenCalled();
    expect(ordersService.createOrderFromSubscription).not.toHaveBeenCalled();
  });

  it('recovers when Razorpay confirms no product order exists, and creates one retry link', async () => {
    const payment = {
      ...openCardPayment(),
      status: SubscriptionPaymentStatus.RECONCILING,
      gatewayOrderId: 'order_auth',
      gatewayPaymentId: 'pay_auth',
      refId: 'spay-1',
      retryCount: 0,
      paymentGateway: 'RAZORPAY',
    };
    let status = SubscriptionPaymentStatus.RECONCILING;
    paymentsService.listReconciling.mockImplementation(async () =>
      status === SubscriptionPaymentStatus.RECONCILING ? [{ ...payment, status }] : [],
    );
    paymentsService.findBySubscriptionId.mockImplementation(async () => [{ ...payment, status }]);
    paymentsService.markFailed.mockImplementation(async () => {
      status = SubscriptionPaymentStatus.FAILED;
    });
    subscriptionsRepository.findByIdAndUserId.mockResolvedValue(
      subscription({ status: ProductSubscriptionStatus.PENDING_PAYMENT, autopayReady: true }),
    );
    mandateService.getForSubscription.mockResolvedValue({
      authorizationOrderId: 'order_auth',
      consentEvidence: { cardAuthOnly: true },
    });
    fetchChargeStatus.mockResolvedValue({
      state: 'captured',
      amount: '1.00',
      gatewayOrderId: 'order_auth',
      gatewayPaymentId: 'pay_auth',
    });
    const lookupChargeByReceipt = jest.fn().mockResolvedValue({ outcome: 'absent' });
    mandateService.adapter.mockImplementation(() => ({
      isConfigured: () => true,
      charge,
      submitRecurringDebit,
      fetchChargeStatus,
      listOrderCharge,
      lookupChargeByReceipt,
    }));
    paymentLinkService.createPaymentLink.mockResolvedValue({
      paymentLink: 'https://pay.example/retry',
      gatewayOrderId: 'order_retry',
      paymentGateway: 'RAZORPAY',
      currency: 'INR',
    });

    await service.retryPayment('user-1', 'sub-1');

    expect(lookupChargeByReceipt).toHaveBeenCalledWith('card-pay-row-1');
    expect(paymentsService.markFailed).toHaveBeenCalledWith(
      'pay-row-1',
      'Razorpay did not create a product charge for this payment',
      'payment-reconcile',
    );
    expect(paymentLinkService.createPaymentLink).toHaveBeenCalledTimes(1);
    expect(paymentsService.markPaidIdempotent).not.toHaveBeenCalled();
    expect(ordersService.createOrderFromSubscription).not.toHaveBeenCalled();
  });

  it('keeps a 27-hour UPI renewal pending until 27 Oct 2026, 3:35 AM IST', async () => {
    const firstCharge = new Date('2026-10-25T19:05:00.000Z');
    const nextDebit = new Date('2026-10-26T22:05:00.000Z');
    const ist = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(nextDebit);
    expect(ist).toContain('27 October 2026');
    expect(ist).toContain('03:35');
    expect(buildBillingCycleRef(nextDebit, ProductSubscriptionFrequency.HOURS_27)).toBe('2026-10-26T2205Z');
    expect(nextDebit.getTime() - firstCharge.getTime()).toBe(27 * 60 * 60 * 1000);

    const cycle = {
      id: 'cycle-27h',
      status: SubscriptionBillingCycleStatus.SCHEDULED,
      paymentId: null,
      chargeDate: nextDebit,
      billingCycleRef: '2026-10-26T2205Z',
    };
    subscriptionsRepository.findById.mockResolvedValue(
      subscription({
        frequency: ProductSubscriptionFrequency.HOURS_27,
        nextBillingDate: nextDebit,
        status: ProductSubscriptionStatus.ACTIVE,
      }),
    );
    billingCycleService.findBySubscriptionId.mockResolvedValue([]);
    billingCycleService.getOrCreate.mockResolvedValue(cycle);
    variantsRepository.findById.mockResolvedValue({ sellingPrice: '2.00' });
    membershipBenefits.getMemberDiscount.mockResolvedValue(null);
    pricingService.calculate.mockReturnValue({ finalAmount: '2.00' });
    mandateService.getForSubscription.mockResolvedValue(upiMandate());
    usersRepository.findById.mockResolvedValue({ email: 'a@example.com', mobileNumber: '9000000000' });
    paymentsService.upsertPendingCycle.mockResolvedValue({ id: 'pay-row-1', refId: 'spay-27h', amount: '2.00' });
    charge.mockResolvedValue({ accepted: true, pending: true, gatewayOrderId: 'order_27h' });

    await (
      service as unknown as {
        presentUpcomingUpiDebit: (id: string, asOf: Date) => Promise<void>;
      }
    ).presentUpcomingUpiDebit('sub-1', firstCharge);

    expect(charge).toHaveBeenCalledTimes(1);
    expect(charge.mock.calls[0][0].debitAt).toEqual(nextDebit);
    expect(submitRecurringDebit).not.toHaveBeenCalled();
    expect(paymentsService.markFailed).not.toHaveBeenCalled();
    expect(billingCycleService.updateById).toHaveBeenCalledWith(
      'cycle-27h',
      expect.objectContaining({
        status: SubscriptionBillingCycleStatus.NOTIFICATION_SENT,
        debitEarliestAt: nextDebit,
        paymentId: 'pay-row-1',
      }),
    );
    expect(cycleUpdates('cycle-27h')).not.toContain(SubscriptionBillingCycleStatus.FAILED);
    expect(subscriptionsRepository.updateById).not.toHaveBeenCalled();
  });

  it('does not fail the future cycle when the pre-debit order is rejected', async () => {
    const nextDebit = new Date('2026-10-26T22:05:00.000Z');
    subscriptionsRepository.findById.mockResolvedValue(
      subscription({
        frequency: ProductSubscriptionFrequency.HOURS_27,
        nextBillingDate: nextDebit,
        status: ProductSubscriptionStatus.ACTIVE,
      }),
    );
    billingCycleService.findBySubscriptionId.mockResolvedValue([]);
    billingCycleService.getOrCreate.mockResolvedValue({
      id: 'cycle-27h',
      status: SubscriptionBillingCycleStatus.SCHEDULED,
      chargeDate: nextDebit,
    });
    variantsRepository.findById.mockResolvedValue({ sellingPrice: '2.00' });
    membershipBenefits.getMemberDiscount.mockResolvedValue(null);
    pricingService.calculate.mockReturnValue({ finalAmount: '2.00' });
    mandateService.getForSubscription.mockResolvedValue(upiMandate());
    usersRepository.findById.mockResolvedValue({ email: 'a@example.com', mobileNumber: '9000000000' });
    paymentsService.upsertPendingCycle.mockResolvedValue({ id: 'pay-row-1', refId: 'spay-27h', amount: '2.00' });
    charge.mockResolvedValue({
      accepted: false,
      pending: false,
      failureReason: 'payment_after is invalid',
    });

    await (
      service as unknown as {
        presentUpcomingUpiDebit: (id: string, asOf: Date) => Promise<void>;
      }
    ).presentUpcomingUpiDebit('sub-1', new Date('2026-10-25T19:05:00.000Z'));

    expect(submitRecurringDebit).not.toHaveBeenCalled();
    expect(paymentsService.markFailed).not.toHaveBeenCalled();
    expect(cycleUpdates('cycle-27h')).not.toContain(SubscriptionBillingCycleStatus.FAILED);
  });

  it('debits a notified UPI cycle once when the scheduled time arrives', async () => {
    const nextDebit = new Date('2026-10-26T22:05:00.000Z');
    const cycle = notifiedCycle(nextDebit);
    subscriptionsRepository.findById.mockResolvedValue(
      subscription({ frequency: ProductSubscriptionFrequency.HOURS_27, nextBillingDate: nextDebit }),
    );
    billingCycleService.findBySubscriptionId.mockResolvedValue([cycle, { ...cycle, id: 'cycle-other', status: SubscriptionBillingCycleStatus.SCHEDULED }]);
    billingCycleService.findById.mockResolvedValue(cycle);
    paymentsService.findById.mockResolvedValue(notifiedPayment());
    mandateService.getForSubscription.mockResolvedValue(upiMandate());
    usersRepository.findById.mockResolvedValue({ email: 'a@example.com', mobileNumber: '9000000000' });
    let claims = 0;
    billingCycleService.claimStatus.mockImplementation(async () => {
      claims += 1;
      return claims === 1;
    });
    submitRecurringDebit.mockResolvedValue({
      accepted: true,
      pending: true,
      gatewayOrderId: 'order_27h',
      gatewayPaymentId: 'pay_27h',
    });

    await renew('sub-1', new Date('2026-10-25T19:05:00.000Z'));
    expect(submitRecurringDebit).not.toHaveBeenCalled();

    await renew('sub-1', nextDebit);
    await renew('sub-1', nextDebit);

    expect(charge).not.toHaveBeenCalled();
    expect(submitRecurringDebit).toHaveBeenCalledTimes(1);
    expect(paymentsService.markFailed).not.toHaveBeenCalled();
    expect(billingCycleService.claimStatus).toHaveBeenCalledWith(
      'cycle-27h',
      [SubscriptionBillingCycleStatus.NOTIFICATION_SENT],
      SubscriptionBillingCycleStatus.DEBIT_PENDING,
      'scheduler',
    );
  });

  it('fails only the due cycle when the scheduled debit is declined', async () => {
    const nextDebit = new Date('2026-10-26T22:05:00.000Z');
    const cycle = notifiedCycle(nextDebit);
    subscriptionsRepository.findById.mockResolvedValue(
      subscription({ frequency: ProductSubscriptionFrequency.HOURS_27, nextBillingDate: nextDebit }),
    );
    billingCycleService.findBySubscriptionId.mockResolvedValue([cycle]);
    billingCycleService.findById.mockResolvedValue(cycle);
    paymentsService.findById.mockResolvedValue(notifiedPayment());
    mandateService.getForSubscription.mockResolvedValue(upiMandate());
    usersRepository.findById.mockResolvedValue({ email: 'a@example.com', mobileNumber: '9000000000' });
    submitRecurringDebit.mockResolvedValue({
      accepted: false,
      pending: false,
      gatewayOrderId: 'order_27h',
      gatewayPaymentId: 'pay_declined',
      failureReason: 'Declined by the bank',
    });

    await renew('sub-1', nextDebit);

    expect(paymentsService.markFailed).toHaveBeenCalledWith('pay-row-1', 'Declined by the bank', 'scheduler');
    expect(billingCycleService.updateById).toHaveBeenCalledWith(
      'cycle-27h',
      expect.objectContaining({ status: SubscriptionBillingCycleStatus.FAILED }),
    );
  });

  it('does not debit again when the scheduled debit times out or its status is unknown', async () => {
    const nextDebit = new Date('2026-10-26T22:05:00.000Z');
    const cycle = notifiedCycle(nextDebit);
    subscriptionsRepository.findById.mockResolvedValue(
      subscription({ frequency: ProductSubscriptionFrequency.HOURS_27, nextBillingDate: nextDebit }),
    );
    billingCycleService.findBySubscriptionId.mockResolvedValue([cycle]);
    billingCycleService.findById.mockResolvedValue(cycle);
    paymentsService.findById.mockResolvedValue(notifiedPayment());
    mandateService.getForSubscription.mockResolvedValue(upiMandate());
    usersRepository.findById.mockResolvedValue({ email: 'a@example.com', mobileNumber: '9000000000' });
    let claims = 0;
    billingCycleService.claimStatus.mockImplementation(async () => {
      claims += 1;
      return claims === 1;
    });
    submitRecurringDebit.mockResolvedValue({
      accepted: true,
      pending: true,
      gatewayOrderId: 'order_27h',
      failureReason: 'timeout talking to Razorpay',
    });

    await renew('sub-1', nextDebit);
    await renew('sub-1', nextDebit);

    expect(submitRecurringDebit).toHaveBeenCalledTimes(1);
    expect(paymentsService.markFailed).not.toHaveBeenCalled();
    expect(cycleUpdates('cycle-27h')).not.toContain(SubscriptionBillingCycleStatus.FAILED);
    expect(ordersService.createOrderFromSubscription).not.toHaveBeenCalled();
  });

  it('correlates payment.failed with one cycle and ignores an early or duplicate webhook', async () => {
    const nextDebit = new Date('2026-10-26T22:05:00.000Z');
    const future = {
      ...notifiedCycle(nextDebit),
      status: SubscriptionBillingCycleStatus.NOTIFICATION_SENT,
    };
    paymentsService.findByGatewayOrderId.mockResolvedValue(null);
    await expect(
      service.handlePaymentFailed({ gatewayOrderId: 'order_other', reason: 'wrong cycle', actor: 'razorpay-webhook' }),
    ).resolves.toBe(false);
    expect(paymentsService.markFailed).not.toHaveBeenCalled();

    const payment = {
      ...notifiedPayment(),
      status: SubscriptionPaymentStatus.RECONCILING,
      billingCycleId: 'cycle-27h',
      subscriptionId: 'sub-1',
    };
    paymentsService.findByGatewayOrderId.mockResolvedValue(payment);
    billingCycleService.findById.mockResolvedValue(future);
    await expect(
      service.handlePaymentFailed({
        gatewayOrderId: 'order_27h',
        reason: 'premature failure',
        actor: 'razorpay-webhook',
      }),
    ).resolves.toBe(false);
    expect(paymentsService.markFailed).not.toHaveBeenCalled();

    const due = {
      ...future,
      status: SubscriptionBillingCycleStatus.DEBIT_PENDING,
      debitEarliestAt: new Date('2026-10-26T22:05:00.000Z'),
    };
    billingCycleService.findById.mockResolvedValue(due);
    await expect(
      service.handlePaymentFailed({ gatewayOrderId: 'order_27h', reason: 'Declined by the bank', actor: 'razorpay-webhook' }),
    ).resolves.toBe(true);
    expect(paymentsService.markFailed).toHaveBeenCalledTimes(1);
    expect(billingCycleService.updateById).toHaveBeenCalledWith(
      'cycle-27h',
      expect.objectContaining({ status: SubscriptionBillingCycleStatus.FAILED }),
    );

    paymentsService.findByGatewayOrderId.mockResolvedValue({
      ...payment,
      status: SubscriptionPaymentStatus.FAILED,
    });
    billingCycleService.findById.mockResolvedValue({
      ...due,
      status: SubscriptionBillingCycleStatus.FAILED,
    });
    await service.handlePaymentFailed({
      gatewayOrderId: 'order_27h',
      reason: 'Declined by the bank',
      actor: 'razorpay-webhook',
    });
    expect(paymentsService.markFailed).toHaveBeenCalledTimes(1);
    expect(historyRepository.append).toHaveBeenCalledTimes(1);
  });

  it('lets only one of two concurrent renewal workers submit the UPI debit', async () => {
    const nextDebit = new Date('2026-10-26T22:05:00.000Z');
    const cycle = notifiedCycle(nextDebit);
    lockService.withDbLock.mockImplementation(serializedLock());
    billingCycleService.findById.mockResolvedValue(cycle);
    paymentsService.findById.mockResolvedValue(notifiedPayment());
    mandateService.getForSubscription.mockResolvedValue(upiMandate());
    usersRepository.findById.mockResolvedValue({ email: 'a@example.com', mobileNumber: '9000000000' });
    let claimed = false;
    billingCycleService.claimStatus.mockImplementation(async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    });
    submitRecurringDebit.mockResolvedValue({
      accepted: true,
      pending: true,
      gatewayOrderId: 'order_27h',
      gatewayPaymentId: 'pay_27h',
    });
    const collect = (
      service as unknown as {
        collectNotifiedUpiDebit: (
          sub: ReturnType<typeof subscription>,
          row: typeof cycle,
        ) => Promise<void>;
      }
    ).collectNotifiedUpiDebit.bind(service);

    await Promise.all([
      collect(subscription({ frequency: ProductSubscriptionFrequency.HOURS_27, nextBillingDate: nextDebit }), cycle),
      collect(subscription({ frequency: ProductSubscriptionFrequency.HOURS_27, nextBillingDate: nextDebit }), cycle),
    ]);

    expect(submitRecurringDebit).toHaveBeenCalledTimes(1);
    expect(paymentsService.markFailed).not.toHaveBeenCalled();
  });

  it('does not submit a debit that crashed before Razorpay accepted it until the order is confirmed empty', async () => {
    const nextDebit = new Date('2026-10-26T22:05:00.000Z');
    const cycle = {
      ...notifiedCycle(nextDebit),
      status: SubscriptionBillingCycleStatus.DEBIT_PENDING,
      processingStartedAt: new Date(nextDebit.getTime() - 60_000),
    };
    subscriptionsRepository.findById.mockResolvedValue(
      subscription({ frequency: ProductSubscriptionFrequency.HOURS_27, nextBillingDate: nextDebit }),
    );
    billingCycleService.findBySubscriptionId.mockResolvedValue([cycle]);
    billingCycleService.findById.mockResolvedValue(cycle);
    paymentsService.findById.mockResolvedValue(notifiedPayment());
    mandateService.getForSubscription.mockResolvedValue(upiMandate());
    listOrderCharge.mockResolvedValue({ outcome: 'absent' });
    billingCycleService.claimDebitRetry.mockResolvedValue(false);

    await renew('sub-1', new Date(nextDebit.getTime() + 60_000));

    expect(listOrderCharge).toHaveBeenCalledWith('order_27h');
    expect(submitRecurringDebit).not.toHaveBeenCalled();
    expect(charge).not.toHaveBeenCalled();
    expect(paymentsService.markFailed).not.toHaveBeenCalled();
    expect(cycle.status).toBe(SubscriptionBillingCycleStatus.DEBIT_PENDING);
  });

  it('submits one debit after a crashed attempt and a confirmed-empty Razorpay order', async () => {
    const nextDebit = new Date('2026-10-26T22:05:00.000Z');
    const cycle = {
      ...notifiedCycle(nextDebit),
      status: SubscriptionBillingCycleStatus.DEBIT_PENDING,
      processingStartedAt: new Date(nextDebit.getTime() - 16 * 60 * 1000),
    };
    subscriptionsRepository.findById.mockResolvedValue(
      subscription({ frequency: ProductSubscriptionFrequency.HOURS_27, nextBillingDate: nextDebit }),
    );
    billingCycleService.findBySubscriptionId.mockResolvedValue([cycle]);
    billingCycleService.findById.mockResolvedValue(cycle);
    paymentsService.findById.mockResolvedValue(notifiedPayment());
    mandateService.getForSubscription.mockResolvedValue(upiMandate());
    usersRepository.findById.mockResolvedValue({ email: 'a@example.com', mobileNumber: '9000000000' });
    listOrderCharge.mockResolvedValue({ outcome: 'absent' });
    let retries = 0;
    billingCycleService.claimDebitRetry.mockImplementation(async () => {
      retries += 1;
      return retries === 1;
    });
    submitRecurringDebit.mockResolvedValue({
      accepted: true,
      pending: true,
      gatewayOrderId: 'order_27h',
      gatewayPaymentId: 'pay_recovered',
    });

    const asOf = new Date(nextDebit.getTime() + 60_000);
    await renew('sub-1', asOf);
    await renew('sub-1', asOf);

    expect(submitRecurringDebit).toHaveBeenCalledTimes(1);
    expect(charge).not.toHaveBeenCalled();
    expect(paymentsService.markFailed).not.toHaveBeenCalled();
  });

  it('leaves a pending Razorpay debit in progress when no webhook arrives', async () => {
    const nextDebit = new Date('2026-10-26T22:05:00.000Z');
    const cycle = {
      ...notifiedCycle(nextDebit),
      status: SubscriptionBillingCycleStatus.DEBIT_PENDING,
    };
    subscriptionsRepository.findById.mockResolvedValue(
      subscription({ frequency: ProductSubscriptionFrequency.HOURS_27, nextBillingDate: nextDebit }),
    );
    billingCycleService.findBySubscriptionId.mockResolvedValue([cycle]);
    paymentsService.findById.mockResolvedValue(notifiedPayment());
    fetchChargeStatus.mockResolvedValue({
      state: 'pending',
      gatewayOrderId: 'order_27h',
      gatewayPaymentId: 'pay_pending',
      amount: '2.00',
    });

    const asOf = new Date(nextDebit.getTime() + 60_000);
    await renew('sub-1', asOf);
    await renew('sub-1', asOf);

    expect(submitRecurringDebit).not.toHaveBeenCalled();
    expect(charge).not.toHaveBeenCalled();
    expect(paymentsService.markFailed).not.toHaveBeenCalled();
    expect(paymentsService.markPaidIdempotent).not.toHaveBeenCalled();
    expect(paymentsService.recordProviderCharge).toHaveBeenCalledWith(
      'pay-row-1',
      expect.objectContaining({ gatewayPaymentId: 'pay_pending', pending: true }),
    );
    expect(cycle.status).toBe(SubscriptionBillingCycleStatus.DEBIT_PENDING);
  });

  it('restores an uncharged failed cycle to the original 27 Oct 2026, 3:35 AM IST debit', async () => {
    const firstCharge = new Date('2026-10-25T19:05:00.000Z');
    const nextDebit = new Date('2026-10-26T22:05:00.000Z');
    const cycle = {
      ...notifiedCycle(nextDebit),
      status: SubscriptionBillingCycleStatus.FAILED,
      failureReason: 'payment_after is invalid',
    };
    subscriptionsRepository.findById.mockResolvedValue(
      subscription({
        frequency: ProductSubscriptionFrequency.HOURS_27,
        nextBillingDate: nextDebit,
        status: ProductSubscriptionStatus.ACTIVE,
      }),
    );
    billingCycleService.findBySubscriptionId.mockResolvedValue([cycle]);
    paymentsService.findById.mockResolvedValue({
      ...notifiedPayment(),
      status: SubscriptionPaymentStatus.FAILED,
      attemptKind: SubscriptionPaymentAttemptKind.AUTOPAY,
    });
    mandateService.getForSubscription.mockResolvedValue(upiMandate());
    listOrderCharge.mockResolvedValue({ outcome: 'absent' });

    await (
      service as unknown as {
        presentUpcomingUpiDebit: (id: string, asOf: Date) => Promise<void>;
      }
    ).presentUpcomingUpiDebit('sub-1', firstCharge);

    expect(listOrderCharge).toHaveBeenCalledWith('order_27h');
    expect(charge).not.toHaveBeenCalled();
    expect(submitRecurringDebit).not.toHaveBeenCalled();
    expect(billingCycleService.updateById).toHaveBeenCalledWith(
      'cycle-27h',
      expect.objectContaining({
        status: SubscriptionBillingCycleStatus.NOTIFICATION_SENT,
        debitEarliestAt: nextDebit,
        failureReason: null,
      }),
    );
    expect(subscriptionsRepository.updateById).not.toHaveBeenCalled();
    expect(buildBillingCycleRef(nextDebit, ProductSubscriptionFrequency.HOURS_27)).toBe('2026-10-26T2205Z');
  });

  it('does not open another debit when the failed cycle already has a Razorpay payment', async () => {
    const nextDebit = new Date('2026-10-26T22:05:00.000Z');
    const cycle = {
      ...notifiedCycle(nextDebit),
      status: SubscriptionBillingCycleStatus.FAILED,
    };
    subscriptionsRepository.findById.mockResolvedValue(
      subscription({
        frequency: ProductSubscriptionFrequency.HOURS_27,
        nextBillingDate: nextDebit,
        status: ProductSubscriptionStatus.ACTIVE,
      }),
    );
    billingCycleService.findBySubscriptionId.mockResolvedValue([cycle]);
    paymentsService.findById.mockResolvedValue({
      ...notifiedPayment(),
      gatewayPaymentId: 'pay_failed',
      status: SubscriptionPaymentStatus.FAILED,
      attemptKind: SubscriptionPaymentAttemptKind.AUTOPAY,
    });
    mandateService.getForSubscription.mockResolvedValue(upiMandate());
    fetchChargeStatus.mockResolvedValue({
      state: 'failed',
      gatewayOrderId: 'order_27h',
      gatewayPaymentId: 'pay_failed',
      failureReason: 'Declined by the bank',
    });

    await (
      service as unknown as {
        presentUpcomingUpiDebit: (id: string, asOf: Date) => Promise<void>;
      }
    ).presentUpcomingUpiDebit('sub-1', new Date('2026-10-25T19:05:00.000Z'));

    expect(submitRecurringDebit).not.toHaveBeenCalled();
    expect(charge).not.toHaveBeenCalled();
    expect(listOrderCharge).not.toHaveBeenCalled();
    expect(paymentsService.markFailed).toHaveBeenCalledWith(
      'pay-row-1',
      'Declined by the bank',
      'scheduler-reconcile',
    );
  });

  it('leaves a failed cycle unchanged when Razorpay cannot list the order', async () => {
    const nextDebit = new Date('2026-10-26T22:05:00.000Z');
    subscriptionsRepository.findById.mockResolvedValue(
      subscription({
        frequency: ProductSubscriptionFrequency.HOURS_27,
        nextBillingDate: nextDebit,
        status: ProductSubscriptionStatus.ACTIVE,
      }),
    );
    billingCycleService.findBySubscriptionId.mockResolvedValue([
      { ...notifiedCycle(nextDebit), status: SubscriptionBillingCycleStatus.FAILED },
    ]);
    paymentsService.findById.mockResolvedValue({
      ...notifiedPayment(),
      status: SubscriptionPaymentStatus.FAILED,
    });
    mandateService.getForSubscription.mockResolvedValue(upiMandate());
    listOrderCharge.mockResolvedValue({ outcome: 'unknown' });

    await (
      service as unknown as {
        presentUpcomingUpiDebit: (id: string, asOf: Date) => Promise<void>;
      }
    ).presentUpcomingUpiDebit('sub-1', new Date('2026-10-25T19:05:00.000Z'));

    expect(billingCycleService.updateById).not.toHaveBeenCalled();
    expect(submitRecurringDebit).not.toHaveBeenCalled();
    expect(charge).not.toHaveBeenCalled();
  });

  it('cancels the AutoPay mandate before the subscription is cancelled', async () => {
    subscriptionsRepository.findByIdAndUserId.mockResolvedValue(
      subscription({
        autopayReady: true,
        config: { deliveryLeadDays: 2, cancellationAllowed: true },
      }),
    );
    mandateService.revokeForSubscription.mockResolvedValue(undefined);

    await service.cancel('user-1', 'sub-1', 'No longer need the product');

    expect(mandateService.revokeForSubscription).toHaveBeenCalledWith('sub-1', 'user-1');
    expect(subscriptionsRepository.updateById).toHaveBeenCalledWith(
      'sub-1',
      expect.objectContaining({
        status: ProductSubscriptionStatus.CANCELLED,
        autopayReady: false,
        cancellationReason: 'No longer need the product',
      }),
    );
    const revokeOrder = mandateService.revokeForSubscription.mock.invocationCallOrder[0];
    const updateOrder = subscriptionsRepository.updateById.mock.invocationCallOrder[0];
    expect(revokeOrder).toBeLessThan(updateOrder);
  });

  it('leaves the subscription active when the AutoPay mandate cannot be cancelled', async () => {
    subscriptionsRepository.findByIdAndUserId.mockResolvedValue(
      subscription({
        autopayReady: true,
        config: { deliveryLeadDays: 2, cancellationAllowed: true },
      }),
    );
    mandateService.revokeForSubscription.mockRejectedValue(new Error('Razorpay token delete failed'));

    await expect(service.cancel('user-1', 'sub-1', 'No longer need the product')).rejects.toThrow(
      /token delete failed/,
    );
    expect(subscriptionsRepository.updateById).not.toHaveBeenCalled();
  });
});

function serializedLock() {
  let chain = Promise.resolve();
  return async (_key: string, fn: () => Promise<unknown>) => {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

function cardMandate() {
  return {
    id: 'man-1',
    authorizationOrderId: 'order_auth',
    authorizationPaymentId: 'pay_auth',
    consentEvidence: {
      cardAuthOnly: true,
      subscriptionPaymentId: 'pay-row-1',
    },
  };
}

function openCardPayment() {
  return {
    id: 'pay-row-1',
    status: SubscriptionPaymentStatus.LINK_GENERATED,
    amount: '2.00',
    userId: 'user-1',
    subscriptionId: 'sub-1',
    billingCycleRef: '2026-10-25',
  };
}

function retryRow(state: {
  status: SubscriptionPaymentStatus;
  paymentLink: string | null;
  gatewayOrderId: string;
}) {
  return {
    id: 'pay-row-1',
    status: state.status,
    paymentLink: state.paymentLink,
    gatewayOrderId: state.gatewayOrderId,
    amount: '2.00',
    refId: 'spay-1',
    retryCount: 0,
    billingCycleRef: '2026-10-25',
    subscriptionId: 'sub-1',
    paymentGateway: 'RAZORPAY',
  };
}

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
    subscriptionPrice: '2.00',
    discountValue: '0.00',
    finalAmount: '2.00',
    discountType: 'FLAT',
    createdAt: new Date('2026-10-25T00:00:00.000Z'),
    updatedAt: new Date('2026-10-25T00:00:00.000Z'),
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
