import { SubscriptionMandateProvider } from '../enums/subscription-mandate-provider.enum';
import { SubscriptionMandateStatus } from '../enums/subscription-mandate-status.enum';

export type MandateAuthSession = {
  provider: SubscriptionMandateProvider;
  authorizationOrderId: string;
  gatewayCustomerId?: string | null;
  gatewaySubscriptionId?: string | null;
  keyId?: string | null;
  amountPaise?: number | null;
  currency: string;
  checkoutPayload: Record<string, unknown>;
  paymentSessionId?: string | null;
  authorizationLink?: string | null;
};

export type MandateStatusSnapshot = {
  status: SubscriptionMandateStatus;
  gatewayMandateId?: string | null;
  gatewayCustomerId?: string | null;
  gatewaySubscriptionId?: string | null;
  validUntil?: Date | null;
  raw?: Record<string, unknown>;
};

export type AutopayChargeResult = {
  accepted: boolean;
  pending: boolean;
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  failureReason?: string | null;
  raw?: Record<string, unknown>;
};

/** Razorpay does not expose an idempotency header on Orders or create/recurring. */
export type GatewayChargeState = 'captured' | 'failed' | 'pending' | 'unknown';

export type GatewayChargeSnapshot = {
  state: GatewayChargeState;
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  failureReason?: string | null;
};

export type CreateMandateAuthInput = {
  subscriptionId: string;
  userId: string;
  customer: {
    name?: string;
    email?: string | null;
    phone: string;
  };
  maxAmount: string;
  /** Rupees charged in this checkout. Defaults to ₹1 when omitted. */
  authorizationAmount?: string;
  currency?: string;
  returnUrl?: string;
  notes: Record<string, string>;
  /** Razorpay authorisation method. Netbanking uses an eMandate token. */
  method?: 'upi' | 'card' | 'emandate';
};

export type ChargeMandateInput = {
  gatewayCustomerId: string;
  gatewayMandateId: string;
  gatewaySubscriptionId?: string | null;
  amount: string;
  currency?: string;
  receipt: string;
  idempotencyKey: string;
  customer: {
    email?: string | null;
    phone: string;
  };
  notes: Record<string, string>;
  scheduleDate?: Date;
  /**
   * UPI pre-debit time. Live Razorpay debits only after this timestamp, which must be at least
   * 25 hours ahead. Card and eMandate charges omit it.
   */
  debitAt?: Date;
};

export interface ISubscriptionMandateProvider {
  readonly provider: SubscriptionMandateProvider;
  isConfigured(): boolean;
  createAuthorizationSession(input: CreateMandateAuthInput): Promise<MandateAuthSession>;
  fetchMandateStatus(params: {
    gatewayMandateId?: string | null;
    gatewaySubscriptionId?: string | null;
    gatewayPaymentId?: string | null;
    gatewayCustomerId?: string | null;
  }): Promise<MandateStatusSnapshot>;
  charge(input: ChargeMandateInput): Promise<AutopayChargeResult>;
  /** Read a renewal debit. Unknown means the caller must not create another charge. */
  fetchChargeStatus(params: {
    gatewayOrderId?: string | null;
    gatewayPaymentId?: string | null;
  }): Promise<GatewayChargeSnapshot>;
}
