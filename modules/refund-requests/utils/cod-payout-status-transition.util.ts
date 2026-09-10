import { CodPayoutStatus } from '../enums/cod-payout-status.enum';

const ALLOWED: Record<CodPayoutStatus, CodPayoutStatus[]> = {
  [CodPayoutStatus.PENDING_DETAILS]: [
    CodPayoutStatus.DETAILS_SUBMITTED,
    CodPayoutStatus.CANCELLED,
  ],
  [CodPayoutStatus.DETAILS_SUBMITTED]: [
    CodPayoutStatus.UNDER_VERIFICATION,
    CodPayoutStatus.PENDING_DETAILS,
    CodPayoutStatus.CANCELLED,
  ],
  [CodPayoutStatus.UNDER_VERIFICATION]: [
    CodPayoutStatus.READY_FOR_PAYOUT,
    CodPayoutStatus.PENDING_DETAILS,
    CodPayoutStatus.ON_HOLD,
    CodPayoutStatus.CANCELLED,
  ],
  [CodPayoutStatus.READY_FOR_PAYOUT]: [
    CodPayoutStatus.PROCESSING,
    CodPayoutStatus.PAID,
    CodPayoutStatus.ON_HOLD,
    CodPayoutStatus.CANCELLED,
  ],
  [CodPayoutStatus.PROCESSING]: [
    CodPayoutStatus.PAID,
    CodPayoutStatus.FAILED,
    CodPayoutStatus.ON_HOLD,
  ],
  [CodPayoutStatus.FAILED]: [
    CodPayoutStatus.READY_FOR_PAYOUT,
    CodPayoutStatus.PROCESSING,
    CodPayoutStatus.ON_HOLD,
    CodPayoutStatus.CANCELLED,
  ],
  [CodPayoutStatus.ON_HOLD]: [
    CodPayoutStatus.UNDER_VERIFICATION,
    CodPayoutStatus.READY_FOR_PAYOUT,
    CodPayoutStatus.CANCELLED,
  ],
  [CodPayoutStatus.PAID]: [],
  [CodPayoutStatus.CANCELLED]: [],
};

export function canTransitionCodPayoutStatus(
  from: CodPayoutStatus,
  to: CodPayoutStatus,
): boolean {
  if (from === to) return true;
  return ALLOWED[from]?.includes(to) ?? false;
}

export function isTerminalCodPayoutStatus(status: CodPayoutStatus): boolean {
  return status === CodPayoutStatus.PAID || status === CodPayoutStatus.CANCELLED;
}
