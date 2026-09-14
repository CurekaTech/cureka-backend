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
