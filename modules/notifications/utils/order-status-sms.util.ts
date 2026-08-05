/**
 * Temporary friendly labels for MSG91 / DLT order-status SMS (var2).
 * Keep all status → SMS text mapping in this one helper.
 */
const ORDER_STATUS_SMS_LABELS: Record<string, string> = {
  PENDING: 'Processing',
  CREATED: 'Processing',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  FAILED_DELIVERY: 'Failed delivery',
  RTO: 'Returned',
};

/**
 * Maps raw DB / enum order status to the value inserted into MSG91 template ##var2##.
 * Unknown statuses are returned trimmed as-is (no silent rewrite).
 */
export function mapOrderStatusForSms(rawStatus: string | null | undefined): string {
  const normalized = String(rawStatus ?? '').trim();
  if (!normalized) {
    return 'Processing';
  }

  const mapped = ORDER_STATUS_SMS_LABELS[normalized.toUpperCase()];
  return mapped ?? normalized;
}
