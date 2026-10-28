/**
 * Cashfree POSTs the payment tab to this URL. It must be a storefront route that
 * accepts POST and only redirects. It is not the one-time order return URL.
 */
export function cashfreeSubscriptionReturnUrl(
  storefrontUrl: string | null | undefined,
  subscriptionId: string,
): string | undefined {
  const base = storefrontUrl?.trim().replace(/\/+$/, '');
  if (!base || !subscriptionId) return undefined;
  const url = new URL('/account/subscriptions/cashfree-return', base);
  url.searchParams.set('subscriptionId', subscriptionId);
  return url.toString();
}
