import { ConfigService } from '@nestjs/config';
import { SubscriptionMandateProvider } from '../enums/subscription-mandate-provider.enum';
import { SubscriptionMandateService } from './subscription-mandate.service';

describe('Subscription mandate gateway selection', () => {
  const mandatesRepository = {
    create: jest.fn(),
    existsByRefId: jest.fn(async () => false),
  };
  const subscriptionsRepository = { updateById: jest.fn() };
  const historyRepository = { append: jest.fn() };
  const cashfree = {
    isConfigured: () => true,
    createAuthorizationSession: jest.fn(async () => ({
      provider: SubscriptionMandateProvider.CASHFREE,
      authorizationOrderId: 'sub_1',
      gatewaySubscriptionId: 'cf_1',
      gatewayCustomerId: null,
      currency: 'INR',
      checkoutPayload: {},
    })),
  };
  const razorpay = { isConfigured: () => true, createAuthorizationSession: jest.fn() };
  const gatewayResolver = { getActiveGateway: jest.fn(async () => 'cashfree') };
  const configService = {
    get: (key: string) => {
      if (key === 'subscriptions.autopayEnabled') return true;
      if (key === 'subscriptions.mandateMaxAmount') return '2500.00';
      return undefined;
    },
  };
  const service = new SubscriptionMandateService(
    mandatesRepository as never,
    subscriptionsRepository as never,
    historyRepository as never,
    razorpay as never,
    cashfree as never,
    configService as ConfigService,
    gatewayResolver as never,
  );

  it('keeps a stored Razorpay subscription on Razorpay when admin selected Cashfree', () => {
    expect(
      service.resolveChargeProvider({ paymentGateway: 'RAZORPAY' } as never),
    ).toBe(SubscriptionMandateProvider.RAZORPAY);
    expect(gatewayResolver.getActiveGateway).not.toHaveBeenCalled();
  });

  it('keeps a stored Cashfree subscription on Cashfree when admin selected Razorpay', () => {
    gatewayResolver.getActiveGateway.mockResolvedValue('razorpay');
    expect(
      service.resolveChargeProvider({ paymentGateway: 'CASHFREE' } as never),
    ).toBe(SubscriptionMandateProvider.CASHFREE);
    expect(gatewayResolver.getActiveGateway).not.toHaveBeenCalled();
  });

  it('does not treat a missing gateway as Razorpay', () => {
    expect(service.resolveChargeProvider({ paymentGateway: null } as never)).toBeNull();
    expect(service.resolveChargeProvider({ paymentGateway: 'PAYU' } as never)).toBeNull();
  });

  it('does not mark a Cashfree card checkout as card-auth only', async () => {
    gatewayResolver.getActiveGateway.mockResolvedValue('cashfree');
    mandatesRepository.create.mockImplementation(async (row: { consentEvidence: { cardAuthOnly: boolean } }) => ({
      id: 'man-1',
      ...row,
    }));
    await service.startAuthorization({
      subscription: {
        id: '11111111-1111-4111-8111-111111111111',
        userId: 'user-1',
        mandateMaxAmount: '2500.00',
      } as never,
      customer: { phone: '9999999999' },
      actor: 'user-1',
      method: 'card',
      authorizationAmount: '2.00',
      returnUrl: 'https://cureka.example/account/subscriptions/cashfree-return?subscriptionId=11111111-1111-4111-8111-111111111111',
    });
    expect(mandatesRepository.create.mock.calls[0][0].consentEvidence.cardAuthOnly).toBe(false);
    expect(cashfree.createAuthorizationSession).toHaveBeenCalledWith(
      expect.objectContaining({
        returnUrl: expect.stringContaining('/account/subscriptions/cashfree-return'),
      }),
    );
    expect(razorpay.createAuthorizationSession).not.toHaveBeenCalled();
  });
});
