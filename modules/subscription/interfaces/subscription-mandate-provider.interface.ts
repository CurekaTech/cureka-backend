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
  /**
   * True only after this call attempted POST /payments/create/recurring.
   * An unreadable payment list is not an attempt. A later empty list may debit once.
   */
  debitAttempted?: boolean;
  raw?: Record<string, unknown>;
};

/** Razorpay does not expose an idempotency header on Orders or create/recurring. */
export type GatewayChargeState = 'captured' | 'failed' | 'pending' | 'unknown';

export type ListedOrderCharge =
  | { outcome: 'unknown' }
  | { outcome: 'absent' }
  | { outcome: 'found'; snapshot: GatewayChargeSnapshot };

export type GatewayChargeSnapshot = {
  state: GatewayChargeState;
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  /** Rupees, when the gateway included an amount. A mismatch must not be treated as the product payment. */
  amount?: string | null;
  /** Present when Razorpay included it. A different currency is not the product payment. */
  currency?: string | null;
  failureReason?: string | null;
};

export type MandateCancelResult = {
  /** True when the gateway mandate is gone, or there was no remote id to cancel. */
  cancelled: boolean;
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
  /**
   * Debit an order whose pre-debit notification was already created.
   * Returns an existing payment instead of creating another one.
   */
  submitRecurringDebit?(
    input: ChargeMandateInput & { gatewayOrderId: string },
  ): Promise<AutopayChargeResult>;
  /** Read a renewal debit. Unknown means the caller must not create another charge. */
  fetchChargeStatus(params: {
    gatewayOrderId?: string | null;
    gatewayPaymentId?: string | null;
    gatewaySubscriptionId?: string | null;
    /**
     * First checkout only. When the local row has no Cashfree payment id yet,
     * one captured subscription payment may be used. A renewal must not set this.
     */
    matchSingleCaptured?: boolean;
  }): Promise<GatewayChargeSnapshot>;
  /**
   * Successful empty means this order has no payment. A transport error is unknown
   * and must not be treated as an absent debit.
   */
  listOrderCharge?(orderId: string): Promise<ListedOrderCharge>;
  /** Stop future recurring charges. Does not refund a payment that already succeeded. */
  cancelMandate(params: {
    gatewayCustomerId?: string | null;
    gatewayMandateId?: string | null;
    gatewaySubscriptionId?: string | null;
  }): Promise<MandateCancelResult>;
}
