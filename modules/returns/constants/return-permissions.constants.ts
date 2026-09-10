/**
 * Permission codes used by the return-management endpoints.
 *
 * The rows themselves are inserted by migration (the seed constant in
 * `modules/roles/constants/admin-permissions.constants.ts` is documentation only),
 * so these identifiers must stay in sync with that migration.
 */
export const RETURN_PERMISSIONS = {
  READ: 'returns.read',
  CREATE: 'returns.create',
  UPDATE: 'returns.update',
  APPROVE: 'returns.approve',
  REJECT: 'returns.reject',
  /** Operational progression: pickup, warehouse receipt, QC, refund/replacement handoff. */
  STATUS: 'returns.status',
  POLICY_READ: 'return_policies.read',
  POLICY_UPDATE: 'return_policies.update',
} as const;

export type ReturnPermissionCode = (typeof RETURN_PERMISSIONS)[keyof typeof RETURN_PERMISSIONS];
