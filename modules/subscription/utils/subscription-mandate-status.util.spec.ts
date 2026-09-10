import { SubscriptionMandateStatus } from '../enums/subscription-mandate-status.enum';
import {
  isMandateAutopayReady,
  mapCashfreeSubscriptionStatus,
  mapRazorpayTokenStatus,
} from './subscription-mandate-status.util';

describe('subscription-mandate-status.util', () => {
  it('only CONFIRMED/AUTHORIZED mandates are AutoPay-ready', () => {
    expect(isMandateAutopayReady(SubscriptionMandateStatus.CONFIRMED)).toBe(true);
    expect(isMandateAutopayReady(SubscriptionMandateStatus.PENDING)).toBe(false);
    expect(isMandateAutopayReady(SubscriptionMandateStatus.REVOKED)).toBe(false);
  });

  it('maps Razorpay token statuses', () => {
    expect(mapRazorpayTokenStatus('confirmed')).toBe(SubscriptionMandateStatus.CONFIRMED);
    expect(mapRazorpayTokenStatus('cancelled')).toBe(SubscriptionMandateStatus.CANCELLED);
    expect(mapRazorpayTokenStatus('expired')).toBe(SubscriptionMandateStatus.EXPIRED);
  });

  it('maps Cashfree subscription statuses', () => {
    expect(mapCashfreeSubscriptionStatus('ACTIVE')).toBe(SubscriptionMandateStatus.CONFIRMED);
    expect(mapCashfreeSubscriptionStatus('INITIALIZED')).toBe(SubscriptionMandateStatus.PENDING);
    expect(mapCashfreeSubscriptionStatus('CANCELLED')).toBe(SubscriptionMandateStatus.CANCELLED);
  });
});
