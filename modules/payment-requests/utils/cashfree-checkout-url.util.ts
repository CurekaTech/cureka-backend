/** Cashfree hosted checkout is not a GET on payments.cashfree.com (that 404s). */

export const CASHFREE_HOSTED_CHECKOUT_PATH = '/api/v1/payments/cashfree/hosted-checkout';

export function normalizeCashfreePaymentSessionId(raw: string): string {
  let id = String(raw ?? '').trim();
  while (id.toLowerCase().endsWith('payment') && id.length > 'session_'.length) {
    id = id.slice(0, -'payment'.length);
  }
  return id;
}

export function cashfreeCheckoutPublicOrigin(storefrontUrl?: string | null): string | undefined {
  const base = storefrontUrl?.trim().replace(/\/+$/, '');
  if (!base) return undefined;
  try {
    const url = new URL(base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return `${url.protocol}//${url.host}`;
  } catch {
    return undefined;
  }
}

export function cashfreeSessionsCheckoutAction(environment: 'sandbox' | 'production' | string): string {
  const env = String(environment ?? '').toLowerCase();
  return env === 'production'
    ? 'https://api.cashfree.com/pg/view/sessions/checkout'
    : 'https://sandbox.cashfree.com/pg/view/sessions/checkout';
}

export function cashfreeSubscriptionCheckoutAction(
  environment: 'sandbox' | 'production' | string,
): string {
  const env = String(environment ?? '').toLowerCase();
  return env === 'production'
    ? 'https://api.cashfree.com/pg/view/subscriptions'
    : 'https://sandbox.cashfree.com/pg/view/subscriptions';
}

export function isCashfreeSubscriptionSessionId(sessionId: string): boolean {
  return /^sub_session_[A-Za-z0-9._-]+$/.test(sessionId);
}

export function isCashfreePaymentSessionId(sessionId: string): boolean {
  return /^session_[A-Za-z0-9._-]+$/.test(sessionId);
}

export function cashfreeSubscriptionHostedCheckoutUrl(
  subscriptionSessionId: string,
  environment: 'sandbox' | 'production' | string,
  publicOrigin?: string | null,
): string {
  const id = encodeURIComponent(normalizeCashfreePaymentSessionId(subscriptionSessionId));
  const origin = cashfreeCheckoutPublicOrigin(publicOrigin);
  const query = `subscription_session_id=${id}`;
  if (origin) return `${origin}${CASHFREE_HOSTED_CHECKOUT_PATH}?${query}`;
  return `${CASHFREE_HOSTED_CHECKOUT_PATH}?${query}`;
}

/**
 * Clickable URL for email and “open in browser”. Cashfree blocks GET on
 * payments.cashfree.com/pg/view/checkout (404). This hits our launcher, which
 * POSTs payment_session_id to Cashfree’s sessions checkout.
 */
export function cashfreeHostedCheckoutUrl(
  paymentSessionId: string,
  environment: 'sandbox' | 'production' | string,
  publicOrigin?: string | null,
): string {
  const id = encodeURIComponent(normalizeCashfreePaymentSessionId(paymentSessionId));
  const origin = cashfreeCheckoutPublicOrigin(publicOrigin);
  if (origin) {
    return `${origin}${CASHFREE_HOSTED_CHECKOUT_PATH}?payment_session_id=${id}`;
  }
  return `${CASHFREE_HOSTED_CHECKOUT_PATH}?payment_session_id=${id}`;
}

export function cashfreeHostedCheckoutHtml(
  paymentSessionId: string,
  environment: 'sandbox' | 'production' | string,
): string {
  const sessionId = normalizeCashfreePaymentSessionId(paymentSessionId);
  if (isCashfreeSubscriptionSessionId(sessionId)) {
    const mode = String(environment ?? '').toLowerCase() === 'production' ? 'production' : 'sandbox';
    const sessionJson = JSON.stringify(sessionId);
    const modeJson = JSON.stringify(mode);
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>Redirecting to Cashfree</title>
    <script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
  </head>
  <body>
    <p id="cashfree-checkout-msg">Redirecting to secure AutoPay checkout…</p>
    <script>
      (function () {
        var cashfree = Cashfree({ mode: ${modeJson} });
        cashfree.subscriptionsCheckout({
          subsSessionId: ${sessionJson},
          redirectTarget: "_self"
        }).then(function (result) {
          if (result && result.error) {
            document.getElementById("cashfree-checkout-msg").textContent =
              result.error.message || "Cashfree checkout could not start.";
          }
        });
      })();
    </script>
  </body>
</html>`;
  }
  const action = escapeHtmlAttr(cashfreeSessionsCheckoutAction(environment));
  const value = escapeHtmlAttr(sessionId);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>Redirecting to Cashfree</title>
  </head>
  <body>
    <p>Redirecting to secure payment…</p>
    <form id="cashfree-checkout" method="post" action="${action}">
      <input type="hidden" name="payment_session_id" value="${value}"/>
    </form>
    <script>document.getElementById('cashfree-checkout').submit();</script>
    <noscript>
      <button type="submit" form="cashfree-checkout">Continue to Cashfree</button>
    </noscript>
  </body>
</html>`;
}

export function rewriteCashfreeHostedCheckoutUrl(
  paymentLink: string | null | undefined,
  publicOrigin?: string | null,
): string | null {
  if (!paymentLink?.trim()) return paymentLink ?? null;
  const raw = paymentLink.trim();
  try {
    const url = new URL(raw, 'https://cureka.local');
    const fromQuery =
      url.searchParams.get('subscription_session_id') ||
      url.searchParams.get('payment_session_id') ||
      url.searchParams.get('session_id');
    const parts = url.pathname.split('/').filter(Boolean);
    const orderIndex = parts.indexOf('order');
    const fromPath =
      orderIndex >= 0 && parts[orderIndex + 1]
        ? decodeURIComponent(parts[orderIndex + 1])
        : null;
    const sessionId = normalizeCashfreePaymentSessionId(fromQuery || fromPath || '');
    if (!isCashfreePaymentSessionId(sessionId) && !isCashfreeSubscriptionSessionId(sessionId)) {
      return raw;
    }
    const environment =
      url.hostname.includes('sandbox') || raw.includes('sandbox.cashfree.com') ? 'sandbox' : 'production';
    const isSubscription =
      isCashfreeSubscriptionSessionId(sessionId) ||
      Boolean(url.searchParams.get('subscription_session_id')) ||
      parts.includes('subscriptions');
    if (isSubscription) {
      return cashfreeSubscriptionHostedCheckoutUrl(sessionId, environment, publicOrigin);
    }
    return cashfreeHostedCheckoutUrl(sessionId, environment, publicOrigin);
  } catch {
    return raw;
  }
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
