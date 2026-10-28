import { registerAs } from '@nestjs/config';

const asBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
};

const asInt = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asMoney = (value: string | undefined): string | null => {
  if (value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed.toFixed(2);
};

/**
 * Product-subscription (Subscribe & Save) operational settings.
 *
 * AutoPay stays disabled until SUBSCRIPTION_AUTOPAY_ENABLED=true AND the
 * merchant's Razorpay Recurring / Cashfree Subscriptions product is actually
 * activated. First-order checkout still uses the existing GoKwik / native
 * payment routing and is independent of this flag.
 */
export const subscriptionsConfig = registerAs('subscriptions', () => ({
  /**
   * Website + admin subscription and membership module.
   * Default false so live stays hidden. Set true only on techbv.
   */
  moduleEnabled: asBool(process.env['SUBSCRIPTIONS_MODULE_ENABLED'], false),
  /**
   * 2-minute, 5-minute, 30-minute, 1-hour, and 1-day tenures for TechBV renewal tests.
   * Leave false in production so monthly, 2-month, quarterly, and yearly stay unchanged.
   * These timers test the scheduler only — they are not a live UPI/card AutoPay SLA.
   */
  testTenuresEnabled: asBool(process.env['SUBSCRIPTION_TEST_TENURES_ENABLED'], false),
  /**
   * Raise Cashfree ON_DEMAND CHARGE before the intended Kolkata billing date.
   * Default on. Set false only to roll back to charge-on-due + T+1-from-now.
   */
  cashfreeAdvanceCharge: asBool(process.env['SUBSCRIPTION_CASHFREE_ADVANCE_CHARGE'], true),
  timezone: process.env['SUBSCRIPTION_TIMEZONE']?.trim() || 'Asia/Kolkata',
  deliveryLeadDays: asInt(process.env['SUBSCRIPTION_DELIVERY_LEAD_DAYS'], 2),
  maxRetries: asInt(process.env['SUBSCRIPTION_MAX_RETRIES'], 3),
  changeCutoffHours: asInt(process.env['SUBSCRIPTION_CHANGE_CUTOFF_HOURS'], 12),
  preDebitHours: asInt(process.env['SUBSCRIPTION_PREDEBIT_HOURS'], 24),
  autopayEnabled: asBool(process.env['SUBSCRIPTION_AUTOPAY_ENABLED'], false),
  /**
   * Optional dedicated AutoPay provider. When unset, a new mandate uses the
   * currently enabled native gateway, but an existing mandate always keeps
   * its original provider.
   */
  autopayProvider: (process.env['SUBSCRIPTION_AUTOPAY_PROVIDER'] ?? '').trim().toUpperCase() || null,
  /**
   * Absolute INR ceiling for a mandate. Product config overrides this.
   * Null means AutoPay cannot be offered until an admin sets a limit.
   */
  mandateMaxAmount: asMoney(process.env['SUBSCRIPTION_MANDATE_MAX_AMOUNT']),
  paymentLinkExpiryHours: asInt(process.env['SUBSCRIPTION_PAYMENT_LINK_EXPIRY_HOURS'], 72),
}));
