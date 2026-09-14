import { ReturnStatus } from '../enums/return-status.enum';
import {
  ACTIVE_RETURN_STATUSES,
  QUANTITY_BLOCKING_STATUSES,
  allowedReturnTransitionsFrom,
  canTransitionReturnStatus,
  isTerminalReturnStatus,
} from './return-status-transition.util';

describe('return status transitions', () => {
  it('allows the happy path from request to completion', () => {
    const path: ReturnStatus[] = [
      ReturnStatus.REQUESTED,
      ReturnStatus.UNDER_REVIEW,
      ReturnStatus.APPROVED,
      ReturnStatus.PICKUP_SCHEDULED,
      ReturnStatus.PICKED_UP,
      ReturnStatus.IN_TRANSIT_TO_WAREHOUSE,
      ReturnStatus.RECEIVED_AT_WAREHOUSE,
      ReturnStatus.QC_PENDING,
      ReturnStatus.QC_PASSED,
      ReturnStatus.REFUND_PENDING,
      ReturnStatus.REFUND_INITIATED,
      ReturnStatus.REFUND_COMPLETED,
      ReturnStatus.COMPLETED,
    ];

    for (let index = 0; index < path.length - 1; index += 1) {
      expect(canTransitionReturnStatus(path[index], path[index + 1])).toBe(true);
    }
  });

  it('never lets an approval jump straight to a refund', () => {
    expect(canTransitionReturnStatus(ReturnStatus.APPROVED, ReturnStatus.REFUND_INITIATED)).toBe(
      false,
    );
    expect(canTransitionReturnStatus(ReturnStatus.APPROVED, ReturnStatus.REFUND_COMPLETED)).toBe(
      false,
    );
    expect(canTransitionReturnStatus(ReturnStatus.REQUESTED, ReturnStatus.REFUND_PENDING)).toBe(
      false,
    );
  });

  it('never lets a fresh request reach a refund without approval', () => {
    expect(canTransitionReturnStatus(ReturnStatus.REQUESTED, ReturnStatus.REFUND_INITIATED)).toBe(
      false,
    );
    expect(canTransitionReturnStatus(ReturnStatus.UNDER_REVIEW, ReturnStatus.PICKED_UP)).toBe(false);
  });

  it('allows a no-pickup approval to move straight into refund resolution', () => {
    expect(canTransitionReturnStatus(ReturnStatus.APPROVED, ReturnStatus.REFUND_PENDING)).toBe(true);
    expect(canTransitionReturnStatus(ReturnStatus.APPROVED, ReturnStatus.REPLACEMENT_PENDING)).toBe(
      true,
    );
  });

  it('treats rejection, cancellation and completion as terminal', () => {
    expect(isTerminalReturnStatus(ReturnStatus.REJECTED)).toBe(true);
    expect(isTerminalReturnStatus(ReturnStatus.CANCELLED_BY_CUSTOMER)).toBe(true);
    expect(isTerminalReturnStatus(ReturnStatus.COMPLETED)).toBe(true);
    expect(allowedReturnTransitionsFrom(ReturnStatus.COMPLETED)).toEqual([]);
  });

  it('allows a customer to withdraw a scheduled pickup that has not been collected', () => {
    expect(
      canTransitionReturnStatus(ReturnStatus.PICKUP_SCHEDULED, ReturnStatus.CANCELLED_BY_CUSTOMER),
    ).toBe(true);
    expect(
      canTransitionReturnStatus(ReturnStatus.PICKED_UP, ReturnStatus.CANCELLED_BY_CUSTOMER),
    ).toBe(false);
  });

  it('rejects a self transition', () => {
    expect(canTransitionReturnStatus(ReturnStatus.APPROVED, ReturnStatus.APPROVED)).toBe(false);
  });

  it('excludes only rejected and customer-cancelled returns from the quantity ledger', () => {
    expect(QUANTITY_BLOCKING_STATUSES).not.toContain(ReturnStatus.REJECTED);
    expect(QUANTITY_BLOCKING_STATUSES).not.toContain(ReturnStatus.CANCELLED_BY_CUSTOMER);
    expect(QUANTITY_BLOCKING_STATUSES).toContain(ReturnStatus.REQUESTED);
    expect(QUANTITY_BLOCKING_STATUSES).toContain(ReturnStatus.COMPLETED);
  });

  it('keeps active statuses free of terminal ones', () => {
    for (const status of ACTIVE_RETURN_STATUSES) {
      expect(isTerminalReturnStatus(status)).toBe(false);
    }
  });
});
