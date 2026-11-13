import { SubscriptionMandateProvider } from '../enums/subscription-mandate-provider.enum';
import { SubscriptionMandateStatus } from '../enums/subscription-mandate-status.enum';
import { SubscriptionRenewalMethod } from '../enums/subscription-renewal-method.enum';
import { SubscriptionMandateService } from './subscription-mandate.service';

describe('SubscriptionMandateService presentation rules', () => {
  const service = Object.create(SubscriptionMandateService.prototype) as SubscriptionMandateService;

  beforeEach(() => {
    jest.spyOn(service, 'isAutopayFeatureEnabled').mockReturnValue(false);
  });

  it('never presents a subscription as AutoPay when the feature flag is off', () => {
    const result = service.canPresentAsAutopay(
      {
        autopayReady: true,
        renewalMethod: SubscriptionRenewalMethod.AUTO_PAY,
      } as never,
      { status: 'CONFIRMED' } as never,
    );
    expect(result).toBe(false);
  });

  it('locks legacy AUTO_PAY without a mandate out of AutoPay presentation', () => {
    jest.spyOn(service, 'isAutopayFeatureEnabled').mockReturnValue(true);
    const result = service.canPresentAsAutopay(
      {
        autopayReady: false,
        renewalMethod: SubscriptionRenewalMethod.PAYMENT_LINK,
      } as never,
      null,
    );
    expect(result).toBe(false);
  });
});

describe('SubscriptionMandateService Cashfree webhook ids', () => {
  const mandatesRepository = {
    findByGatewayMandateId: jest.fn(),
    findByGatewaySubscriptionId: jest.fn(),
    findByAuthorizationOrderId: jest.fn(),
    findLatestPendingByGatewayCustomerId: jest.fn(),
    findById: jest.fn(),
    updateById: jest.fn(),
  };
  const subscriptionsRepository = { findById: jest.fn(), updateById: jest.fn() };
  const historyRepository = { append: jest.fn() };
  const service = new SubscriptionMandateService(
    mandatesRepository as never,
    subscriptionsRepository as never,
    historyRepository as never,
    { isConfigured: () => false } as never,
    { isConfigured: () => true } as never,
    { get: () => true } as never,
    { getActiveGateway: jest.fn() } as never,
  );

  const mandate = {
    id: 'man-1',
    subscriptionId: 'sub-row',
    provider: SubscriptionMandateProvider.CASHFREE,
    status: SubscriptionMandateStatus.PENDING,
    gatewaySubscriptionId: '408863225',
    authorizationOrderId: 'sub_39a38148-135b-4eb2-9860-487073358212',
    gatewayMandateId: null,
    authorizedAt: null,
    revokedAt: null,
    metadata: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mandatesRepository.findByGatewayMandateId.mockResolvedValue(null);
    mandatesRepository.findByGatewaySubscriptionId.mockImplementation(async (id: string) =>
      id === '408863225' ? mandate : null,
    );
    mandatesRepository.findByAuthorizationOrderId.mockImplementation(async (id: string) =>
      id.startsWith('sub_') ? mandate : null,
    );
    mandatesRepository.findById.mockResolvedValue(mandate);
    subscriptionsRepository.findById.mockResolvedValue({ status: 'ACTIVE' });
  });

  it('matches a webhook by merchant id even when the stored row still has the numeric reference', async () => {
    await expect(
      service.handleProviderWebhook({
        provider: SubscriptionMandateProvider.CASHFREE,
        gatewayMandateId: '408863225',
        gatewaySubscriptionId: 'sub_39a38148-135b-4eb2-9860-487073358212',
        authorizationOrderId: 'sub_39a38148-135b-4eb2-9860-487073358212',
        status: SubscriptionMandateStatus.CONFIRMED,
        actor: 'cashfree-webhook',
        raw: { type: 'SUBSCRIPTION_STATUS_CHANGED' },
      }),
    ).resolves.toBe(true);
    expect(mandatesRepository.updateById).toHaveBeenCalledWith(
      'man-1',
      expect.objectContaining({
        gatewaySubscriptionId: 'sub_39a38148-135b-4eb2-9860-487073358212',
        gatewayMandateId: '408863225',
        status: SubscriptionMandateStatus.CONFIRMED,
      }),
    );
  });

  it('applies a duplicate ACTIVE webhook without creating another mandate row', async () => {
    await service.handleProviderWebhook({
      provider: SubscriptionMandateProvider.CASHFREE,
      gatewaySubscriptionId: 'sub_39a38148-135b-4eb2-9860-487073358212',
      authorizationOrderId: 'sub_39a38148-135b-4eb2-9860-487073358212',
      status: SubscriptionMandateStatus.CONFIRMED,
      actor: 'cashfree-webhook',
    });
    await service.handleProviderWebhook({
      provider: SubscriptionMandateProvider.CASHFREE,
      gatewaySubscriptionId: 'sub_39a38148-135b-4eb2-9860-487073358212',
      authorizationOrderId: 'sub_39a38148-135b-4eb2-9860-487073358212',
      status: SubscriptionMandateStatus.CONFIRMED,
      actor: 'cashfree-webhook',
    });
    expect(mandatesRepository.updateById).toHaveBeenCalledTimes(2);
    expect(historyRepository.append).toHaveBeenCalledTimes(2);
  });
});
