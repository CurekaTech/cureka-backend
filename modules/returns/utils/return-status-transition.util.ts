import { ReturnStatus } from '../enums/return-status.enum';

/**
 * Allowed return-status transitions. Every status change routes through
 * `canTransitionReturnStatus` — arbitrary status writes are not permitted.
 */
const ALLOWED: Record<ReturnStatus, ReturnStatus[]> = {
  [ReturnStatus.REQUESTED]: [
    ReturnStatus.UNDER_REVIEW,
    ReturnStatus.ADDITIONAL_INFORMATION_REQUIRED,
    ReturnStatus.APPROVED,
    ReturnStatus.REJECTED,
    ReturnStatus.CANCELLED_BY_CUSTOMER,
  ],
  [ReturnStatus.UNDER_REVIEW]: [
    ReturnStatus.ADDITIONAL_INFORMATION_REQUIRED,
    ReturnStatus.APPROVED,
    ReturnStatus.REJECTED,
    ReturnStatus.CANCELLED_BY_CUSTOMER,
  ],
  [ReturnStatus.ADDITIONAL_INFORMATION_REQUIRED]: [
    ReturnStatus.UNDER_REVIEW,
    ReturnStatus.APPROVED,
    ReturnStatus.REJECTED,
    ReturnStatus.CANCELLED_BY_CUSTOMER,
  ],
  [ReturnStatus.APPROVED]: [
    ReturnStatus.PICKUP_SCHEDULED,
    ReturnStatus.REFUND_PENDING,
    ReturnStatus.REPLACEMENT_PENDING,
    ReturnStatus.CANCELLED_BY_CUSTOMER,
  ],
  [ReturnStatus.PICKUP_SCHEDULED]: [
    ReturnStatus.PICKUP_ATTEMPTED,
    ReturnStatus.PICKED_UP,
    ReturnStatus.REJECTED,
    ReturnStatus.CANCELLED_BY_CUSTOMER,
  ],
  [ReturnStatus.PICKUP_ATTEMPTED]: [
    ReturnStatus.PICKUP_SCHEDULED,
    ReturnStatus.PICKED_UP,
    ReturnStatus.REJECTED,
    ReturnStatus.CANCELLED_BY_CUSTOMER,
  ],
  [ReturnStatus.PICKED_UP]: [
    ReturnStatus.IN_TRANSIT_TO_WAREHOUSE,
    ReturnStatus.RECEIVED_AT_WAREHOUSE,
  ],
  [ReturnStatus.IN_TRANSIT_TO_WAREHOUSE]: [ReturnStatus.RECEIVED_AT_WAREHOUSE],
  [ReturnStatus.RECEIVED_AT_WAREHOUSE]: [
    ReturnStatus.QC_PENDING,
    ReturnStatus.REFUND_PENDING,
    ReturnStatus.REPLACEMENT_PENDING,
  ],
  [ReturnStatus.QC_PENDING]: [ReturnStatus.QC_PASSED, ReturnStatus.QC_FAILED],
  [ReturnStatus.QC_PASSED]: [ReturnStatus.REFUND_PENDING, ReturnStatus.REPLACEMENT_PENDING],
  [ReturnStatus.QC_FAILED]: [ReturnStatus.REJECTED, ReturnStatus.COMPLETED],
  [ReturnStatus.REFUND_PENDING]: [ReturnStatus.REFUND_INITIATED, ReturnStatus.REJECTED],
  // A failed provider refund drops back to pending so finance can retry.
  [ReturnStatus.REFUND_INITIATED]: [ReturnStatus.REFUND_COMPLETED, ReturnStatus.REFUND_PENDING],
  [ReturnStatus.REFUND_COMPLETED]: [ReturnStatus.COMPLETED],
  // An unavailable replacement variant may be converted to the refund path.
  [ReturnStatus.REPLACEMENT_PENDING]: [
    ReturnStatus.REPLACEMENT_CREATED,
    ReturnStatus.REFUND_PENDING,
  ],
  [ReturnStatus.REPLACEMENT_CREATED]: [ReturnStatus.COMPLETED],
  [ReturnStatus.COMPLETED]: [],
  [ReturnStatus.REJECTED]: [],
  [ReturnStatus.CANCELLED_BY_CUSTOMER]: [],
};

const TERMINAL_STATUSES: ReturnStatus[] = [
  ReturnStatus.COMPLETED,
  ReturnStatus.REJECTED,
  ReturnStatus.CANCELLED_BY_CUSTOMER,
];

/**
 * A self-transition is rejected on purpose: it is what stops a second `approve`
 * or `reject` call from re-stamping an already-decided return. Actions that only
 * append to the timeline (comments, notes, assignment) write history directly
 * instead of going through a transition.
 */
export function canTransitionReturnStatus(from: ReturnStatus, to: ReturnStatus): boolean {
  if (from === to) {
    return false;
  }
  return ALLOWED[from]?.includes(to) ?? false;
}

/**
 * Pickup updates can skip ahead (scheduled → delivered). Walk only legal
 * forward hops so the return actually leaves "pickup scheduled".
 */
export function returnStatusesForPickupAdvance(
  from: ReturnStatus,
  target: ReturnStatus,
): ReturnStatus[] {
  if (from === target) return [];
  if (canTransitionReturnStatus(from, target)) return [target];

  const pipeline: ReturnStatus[] = [
    ReturnStatus.PICKUP_SCHEDULED,
    ReturnStatus.PICKED_UP,
    ReturnStatus.IN_TRANSIT_TO_WAREHOUSE,
    ReturnStatus.RECEIVED_AT_WAREHOUSE,
  ];
  const targetIndex = pipeline.indexOf(target);
  if (targetIndex < 0) return [];

  const startIndex = pipeline.indexOf(from);
  const sequence =
    startIndex >= 0
      ? pipeline.slice(startIndex + 1, targetIndex + 1)
      : from === ReturnStatus.PICKUP_ATTEMPTED
        ? pipeline.slice(pipeline.indexOf(ReturnStatus.PICKED_UP), targetIndex + 1)
        : [];

  const steps: ReturnStatus[] = [];
  let cursor = from;
  for (const next of sequence) {
    if (canTransitionReturnStatus(cursor, target)) {
      steps.push(target);
      return steps;
    }
    if (!canTransitionReturnStatus(cursor, next)) return steps;
    steps.push(next);
    cursor = next;
  }
  return steps;
}

export function allowedReturnTransitionsFrom(from: ReturnStatus): ReturnStatus[] {
  return [...(ALLOWED[from] ?? [])];
}

export function isTerminalReturnStatus(status: ReturnStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isActiveReturnStatus(status: ReturnStatus): boolean {
  return !isTerminalReturnStatus(status);
}

/** Statuses that still hold quantity against the order item. */
export const QUANTITY_BLOCKING_STATUSES: ReturnStatus[] = Object.values(ReturnStatus).filter(
  (status) =>
    status !== ReturnStatus.REJECTED && status !== ReturnStatus.CANCELLED_BY_CUSTOMER,
);

export const ACTIVE_RETURN_STATUSES: ReturnStatus[] = Object.values(ReturnStatus).filter(
  (status) => isActiveReturnStatus(status),
);
