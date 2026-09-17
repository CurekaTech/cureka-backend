/**
 * Cancellation *request* workflow. Distinct from `orders.order_status`,
 * which remains the fulfilment status of the sale.
 */
export enum CancellationStatus {
  NONE = 'NONE',
  REQUESTED = 'REQUESTED',
  PROCESSING = 'PROCESSING',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
  REQUIRES_ATTENTION = 'REQUIRES_ATTENTION',
  HISTORICAL_UNVERIFIED = 'HISTORICAL_UNVERIFIED',
}
