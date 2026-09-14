/**
 * Outcome of one external cancellation step (Unicommerce or Shipway).
 * A local CANCELLED order is not proof that either step succeeded.
 */
export enum CancellationSyncStatus {
  NOT_STARTED = 'NOT_STARTED',
  NOT_REQUIRED = 'NOT_REQUIRED',
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  UNCERTAIN = 'UNCERTAIN',
  REJECTED = 'REJECTED',
  UNSUPPORTED = 'UNSUPPORTED',
}
