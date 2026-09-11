import { PolicyWindowUnit } from '@modules/product/enums/policy-window-unit.enum';

/**
 * How an order item's policy snapshot was produced.
 *
 * - `SNAPSHOT`  — captured from the catalogue when the order was placed. Authoritative.
 * - `LEGACY_FALLBACK` — the order predates snapshotting. Resolved lazily from the
 *   current catalogue and deliberately conservative: it never grants a return that
 *   the live product does not currently allow.
 */
export type ReturnPolicySnapshotSource = 'SNAPSHOT' | 'LEGACY_FALLBACK';

/**
 * Immutable copy of the return/replacement/refund policy that applied when the
 * order was placed. Later catalogue edits must not change eligibility for an
 * order that has already been placed.
 */
export interface IOrderItemReturnPolicySnapshot {
  source: ReturnPolicySnapshotSource;
  /** ISO-8601 timestamp of when the snapshot was captured. */
  capturedAt: string;
  returnable: boolean;
  refundable: boolean;
  replaceable: boolean;
  returnWindow: number | null;
  returnWindowUnit: PolicyWindowUnit;
  replacementWindow: number | null;
  replacementWindowUnit: PolicyWindowUnit;
  pickupRequired: boolean;
  qcRequired: boolean;
  customerEvidenceRequired: boolean;
  noPickupRefundAllowed: boolean;
  /** Free-text policy shown to the customer on the product page. */
  policyText: string | null;
}
