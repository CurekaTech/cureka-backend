import { SubscriptionMandateStatus } from '../enums/subscription-mandate-status.enum';

const AUTOPAY_READY_STATUSES = new Set<SubscriptionMandateStatus>([
  SubscriptionMandateStatus.CONFIRMED,
  SubscriptionMandateStatus.AUTHORIZED,
]);

const TERMINAL_MANDATE_STATUSES = new Set<SubscriptionMandateStatus>([
  SubscriptionMandateStatus.FAILED,
  SubscriptionMandateStatus.EXPIRED,
  SubscriptionMandateStatus.REVOKED,
  SubscriptionMandateStatus.CANCELLED,
]);

export function isMandateAutopayReady(status: SubscriptionMandateStatus): boolean {
  return AUTOPAY_READY_STATUSES.has(status);
}

export function isMandateTerminal(status: SubscriptionMandateStatus): boolean {
  return TERMINAL_MANDATE_STATUSES.has(status);
}

export function mapRazorpayTokenStatus(status: string | undefined): SubscriptionMandateStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'confirmed':
      return SubscriptionMandateStatus.CONFIRMED;
    case 'authorized':
      return SubscriptionMandateStatus.AUTHORIZED;
    case 'paused':
      return SubscriptionMandateStatus.PAUSED;
    case 'cancelled':
    case 'canceled':
      return SubscriptionMandateStatus.CANCELLED;
    case 'rejected':
      return SubscriptionMandateStatus.FAILED;
    case 'expired':
      return SubscriptionMandateStatus.EXPIRED;
    default:
      return SubscriptionMandateStatus.PENDING;
  }
}

export function mapCashfreeSubscriptionStatus(
  status: string | undefined,
): SubscriptionMandateStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'ACTIVE':
    case 'BANK_APPROVAL_PENDING':
      return SubscriptionMandateStatus.CONFIRMED;
    case 'INITIALIZED':
    case 'PENDING':
    case 'CUSTOMER_ACCEPTED':
      return SubscriptionMandateStatus.PENDING;
    case 'ON_HOLD':
    case 'PAUSED':
      return SubscriptionMandateStatus.PAUSED;
    case 'CANCELLED':
    case 'CANCELED':
      return SubscriptionMandateStatus.CANCELLED;
    case 'EXPIRED':
    case 'COMPLETED':
      return SubscriptionMandateStatus.EXPIRED;
    case 'CUSTOMER_REJECTED':
    case 'FAILED':
      return SubscriptionMandateStatus.FAILED;
    default:
      return SubscriptionMandateStatus.PENDING;
  }
}
