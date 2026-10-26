export interface CashfreeSubscriptionWebhookFields {
  merchantSubscriptionId: string;
  cfSubscriptionId: string;
  subscriptionStatus: string;
  subscriptionPaymentId?: string;
  cfPaymentId: string;
  paymentId: string;
  paymentStatus: string;
  paymentType: string;
  paymentAmount: number | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/**
 * Cashfree subscription webhooks (2025-01-01) put the mandate on
 * `data.subscription_details` and the charge on `data` itself.
 * Older payloads used `data.subscription`. Both shapes are accepted.
 */
export function readCashfreeSubscriptionWebhook(
  payload: Record<string, unknown>,
): CashfreeSubscriptionWebhookFields {
  const data = asRecord(payload['data']);
  const nested = asRecord(data['subscription'] ?? payload['subscription']);
  const details = asRecord(data['subscription_details'] ?? nested);
  const tags = asRecord(details['subscription_tags'] ?? data['subscription_tags'] ?? nested['subscription_tags']);
  const gateway = asRecord(data['payment_gateway_details']);
  const payment = asRecord(data['payment']);

  const amountRaw = data['payment_amount'] ?? payment['payment_amount'];
  const paymentAmount = typeof amountRaw === 'number' ? amountRaw : Number(amountRaw);

  return {
    merchantSubscriptionId: text(
      data['subscription_id'] ?? details['subscription_id'] ?? nested['subscription_id'],
    ),
    cfSubscriptionId: text(
      data['cf_subscription_id'] ??
        details['cf_subscription_id'] ??
        gateway['gateway_subscription_id'] ??
        nested['cf_subscription_id'],
    ),
    subscriptionStatus: text(
      details['subscription_status'] ?? data['subscription_status'] ?? nested['subscription_status'],
    ),
    subscriptionPaymentId: text(tags['subscriptionPaymentId']) || undefined,
    cfPaymentId: text(data['cf_payment_id'] ?? payment['cf_payment_id'] ?? gateway['gateway_payment_id']),
    paymentId: text(data['payment_id'] ?? payment['payment_id']),
    paymentStatus: text(data['payment_status'] ?? payment['payment_status']),
    paymentType: text(data['payment_type'] ?? payment['payment_type']),
    paymentAmount: Number.isFinite(paymentAmount) ? paymentAmount : null,
  };
}
