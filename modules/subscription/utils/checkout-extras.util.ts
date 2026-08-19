import type { CreateSubscriptionPaymentLinkResult } from '../services/subscription-payment-link.service';

export type SubscriptionCheckoutExtras = {
  paymentLink?: string | null;
  razorpayOrderId?: string | null;
  keyId?: string | null;
  amount?: number | null;
  currency?: string | null;
  paymentSessionId?: string | null;
  environment?: 'sandbox' | 'production' | null;
  customer?: {
    name?: string;
    email?: string;
    contact?: string;
  } | null;
};

export function checkoutExtrasFromLink(
  link: CreateSubscriptionPaymentLinkResult,
): SubscriptionCheckoutExtras {
  return {
    paymentLink: link.paymentLink,
    razorpayOrderId: link.razorpayOrderId ?? null,
    keyId: link.keyId ?? null,
    amount: link.amount ?? null,
    currency: link.currency,
    paymentSessionId: link.paymentSessionId ?? null,
    environment: link.environment ?? null,
    customer: link.customer,
  };
}

export function paymentSessionIdFromLink(paymentLink: string | null): string | null {
  if (!paymentLink) return null;
  try {
    const url = new URL(paymentLink);
    const fromQuery =
      url.searchParams.get('payment_session_id') || url.searchParams.get('session_id');
    if (fromQuery) return fromQuery;
    const parts = url.pathname.split('/').filter(Boolean);
    const orderIndex = parts.indexOf('order');
    if (orderIndex >= 0 && parts[orderIndex + 1]) {
      return decodeURIComponent(parts[orderIndex + 1]);
    }
  } catch {
    return null;
  }
  return null;
}
