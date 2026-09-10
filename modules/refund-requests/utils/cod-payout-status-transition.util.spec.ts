import { CodPayoutStatus } from '../enums/cod-payout-status.enum';
import { canTransitionCodPayoutStatus } from './cod-payout-status-transition.util';

describe('COD payout status transitions', () => {
  it('allows details submitted to verification to ready to processing to paid', () => {
    expect(canTransitionCodPayoutStatus(CodPayoutStatus.DETAILS_SUBMITTED, CodPayoutStatus.UNDER_VERIFICATION)).toBe(true);
    expect(canTransitionCodPayoutStatus(CodPayoutStatus.UNDER_VERIFICATION, CodPayoutStatus.READY_FOR_PAYOUT)).toBe(true);
    expect(canTransitionCodPayoutStatus(CodPayoutStatus.READY_FOR_PAYOUT, CodPayoutStatus.PROCESSING)).toBe(true);
    expect(canTransitionCodPayoutStatus(CodPayoutStatus.PROCESSING, CodPayoutStatus.PAID)).toBe(true);
  });

  it('does not allow paid without passing through an operational state', () => {
    expect(canTransitionCodPayoutStatus(CodPayoutStatus.PENDING_DETAILS, CodPayoutStatus.PAID)).toBe(false);
    expect(canTransitionCodPayoutStatus(CodPayoutStatus.DETAILS_SUBMITTED, CodPayoutStatus.PAID)).toBe(false);
  });

  it('allows a failed payout to be retried without a second refund', () => {
    expect(canTransitionCodPayoutStatus(CodPayoutStatus.FAILED, CodPayoutStatus.READY_FOR_PAYOUT)).toBe(true);
    expect(canTransitionCodPayoutStatus(CodPayoutStatus.PAID, CodPayoutStatus.PROCESSING)).toBe(false);
  });
});
