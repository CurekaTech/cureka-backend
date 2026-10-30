export const SUBSCRIPTION_DEFAULT_TIMEZONE = 'Asia/Kolkata';

/** BI_MONTHLY means every two calendar months — never twice per month. */
export const PRODUCT_FREQUENCY_MONTHS = {
  MONTHLY: 1,
  BI_MONTHLY: 2,
  QUARTERLY: 3,
  YEARLY: 12,
} as const;

export const PRODUCT_FREQUENCY_DAYS = { DAILY: 1 } as const;

/** Short TechBV test intervals, in minutes. Production tenures are not listed here. */
export const PRODUCT_FREQUENCY_MINUTES = {
  MINUTES_2: 2,
  MINUTES_5: 5,
  MINUTES_30: 30,
  HOURLY: 60,
  HOURS_27: 27 * 60,
  HOURS_48: 48 * 60,
  HOURS_72: 72 * 60,
} as const;

export const PRODUCT_FREQUENCY_LABELS = {
  MINUTES_2: 'Every 2 minutes',
  MINUTES_5: 'Every 5 minutes',
  MINUTES_30: 'Every 30 minutes',
  HOURLY: 'Every 1 hour',
  HOURS_27: 'Every 27 hours',
  HOURS_48: 'Every 48 hours',
  HOURS_72: 'Every 72 hours',
  DAILY: 'Every 1 day',
  MONTHLY: 'Every month',
  BI_MONTHLY: 'Every 2 months',
  QUARTERLY: 'Every 3 months',
  YEARLY: 'Every year',
} as const;

export function describeProductFrequency(frequency: string): {
  intervalMinutes?: number;
  intervalDays?: number;
  intervalMonths?: number;
  label: string;
} {
  if (frequency === 'MINUTES_2') {
    return { intervalMinutes: 2, label: PRODUCT_FREQUENCY_LABELS.MINUTES_2 };
  }
  if (frequency === 'MINUTES_5') {
    return { intervalMinutes: 5, label: PRODUCT_FREQUENCY_LABELS.MINUTES_5 };
  }
  if (frequency === 'MINUTES_30') {
    return { intervalMinutes: 30, label: PRODUCT_FREQUENCY_LABELS.MINUTES_30 };
  }
  if (frequency === 'HOURLY') {
    return { intervalMinutes: 60, label: PRODUCT_FREQUENCY_LABELS.HOURLY };
  }
  if (frequency === 'HOURS_27') {
    return { intervalMinutes: 27 * 60, label: PRODUCT_FREQUENCY_LABELS.HOURS_27 };
  }
  if (frequency === 'HOURS_48') {
    return { intervalMinutes: 48 * 60, label: PRODUCT_FREQUENCY_LABELS.HOURS_48 };
  }
  if (frequency === 'HOURS_72') {
    return { intervalMinutes: 72 * 60, label: PRODUCT_FREQUENCY_LABELS.HOURS_72 };
  }
  if (frequency === 'DAILY') {
    return { intervalDays: 1, label: PRODUCT_FREQUENCY_LABELS.DAILY };
  }
  if (frequency === 'BI_MONTHLY') {
    return { intervalMonths: 2, label: PRODUCT_FREQUENCY_LABELS.BI_MONTHLY };
  }
  if (frequency === 'QUARTERLY') {
    return { intervalMonths: 3, label: PRODUCT_FREQUENCY_LABELS.QUARTERLY };
  }
  if (frequency === 'YEARLY') {
    return { intervalMonths: 12, label: PRODUCT_FREQUENCY_LABELS.YEARLY };
  }
  return { intervalMonths: 1, label: PRODUCT_FREQUENCY_LABELS.MONTHLY };
}

export const SUBSCRIPTION_ERROR = {
  MIXED_CART_UNSUPPORTED: 'SUBSCRIPTION_MIXED_CART_UNSUPPORTED',
  AUTOPAY_UNAVAILABLE: 'SUBSCRIPTION_AUTOPAY_UNAVAILABLE',
  MANDATE_LIMIT_EXCEEDED: 'SUBSCRIPTION_MANDATE_LIMIT_EXCEEDED',
  MANDATE_NOT_CONFIRMED: 'SUBSCRIPTION_MANDATE_NOT_CONFIRMED',
  CYCLE_LOCKED: 'SUBSCRIPTION_CYCLE_LOCKED',
  CYCLE_ALREADY_PAID: 'SUBSCRIPTION_CYCLE_ALREADY_PAID',
  CYCLE_IN_FLIGHT: 'SUBSCRIPTION_CYCLE_IN_FLIGHT',
  CHANGE_CUTOFF: 'SUBSCRIPTION_CHANGE_CUTOFF',
  QUANTITY_CHANGE_DISABLED: 'SUBSCRIPTION_QUANTITY_CHANGE_DISABLED',
  LEGACY_MANDATE_REQUIRED: 'SUBSCRIPTION_LEGACY_MANDATE_REQUIRED',
  PROVIDER_MISMATCH: 'SUBSCRIPTION_PROVIDER_MISMATCH',
} as const;
