/** Cashfree hosted checkout is query-param based. `/order/{session}` 404s. */

export function normalizeCashfreePaymentSessionId(raw: string): string {
  let id = String(raw ?? '').trim();
  while (id.toLowerCase().endsWith('payment') && id.length > 'session_'.length) {
    id = id.slice(0, -'payment'.length);
  }
  return id;
}

export function cashfreeHostedCheckoutUrl(
  paymentSessionId: string,
  environment: 'sandbox' | 'production' | string,
): string {
  const id = encodeURIComponent(normalizeCashfreePaymentSessionId(paymentSessionId));
  const env = String(environment ?? '').toLowerCase();
  if (env === 'production') {
    return `https://payments.cashfree.com/pg/view/checkout?payment_session_id=${id}`;
  }
  return `https://sandbox.cashfree.com/pg/view/checkout?payment_session_id=${id}`;
}

export function rewriteCashfreeHostedCheckoutUrl(paymentLink: string | null | undefined): string | null {
  if (!paymentLink?.trim()) return paymentLink ?? null;
  const raw = paymentLink.trim();
  try {
    const url = new URL(raw);
    const fromQuery =
      url.searchParams.get('payment_session_id') ||
      url.searchParams.get('subscription_session_id') ||
      url.searchParams.get('session_id');
    const parts = url.pathname.split('/').filter(Boolean);
    const orderIndex = parts.indexOf('order');
    const fromPath =
      orderIndex >= 0 && parts[orderIndex + 1]
        ? decodeURIComponent(parts[orderIndex + 1])
        : null;
    const sessionId = normalizeCashfreePaymentSessionId(fromQuery || fromPath || '');
    if (!sessionId.startsWith('session_')) return raw;
    const environment = url.hostname.includes('sandbox') ? 'sandbox' : 'production';
    return cashfreeHostedCheckoutUrl(sessionId, environment);
  } catch {
    return raw;
  }
}
