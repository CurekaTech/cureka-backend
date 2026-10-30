export enum ProductSubscriptionFrequency {
  /** TechBV test tenure. Hidden unless SUBSCRIPTION_TEST_TENURES_ENABLED=true. */
  MINUTES_2 = 'MINUTES_2',
  /** TechBV test tenure. Hidden unless SUBSCRIPTION_TEST_TENURES_ENABLED=true. */
  MINUTES_5 = 'MINUTES_5',
  /** TechBV test tenure. Hidden unless SUBSCRIPTION_TEST_TENURES_ENABLED=true. */
  MINUTES_30 = 'MINUTES_30',
  /** TechBV test tenure. Hidden unless SUBSCRIPTION_TEST_TENURES_ENABLED=true. */
  HOURLY = 'HOURLY',
  /**
   * TechBV test tenure for live UPI. Razorpay needs about 25 hours of notice,
   * so the debit is sent immediately and collected 27 hours later.
   * Hidden unless SUBSCRIPTION_TEST_TENURES_ENABLED=true.
   */
  HOURS_27 = 'HOURS_27',
  /**
   * TechBV test tenure for Cashfree UPI AutoPay (exact +48h).
   * Gives a Kolkata T+2 calendar window so CHARGE can be raised before debit.
   * Hidden unless SUBSCRIPTION_TEST_TENURES_ENABLED=true.
   */
  HOURS_48 = 'HOURS_48',
  /**
   * TechBV test tenure for Cashfree Card AutoPay (exact +72h).
   * Gives a Kolkata T+2…T+3 window so CHARGE can be raised without T+1 card SI.
   * Hidden unless SUBSCRIPTION_TEST_TENURES_ENABLED=true.
   */
  HOURS_72 = 'HOURS_72',
  /** TechBV test tenure (1 day). Hidden unless SUBSCRIPTION_TEST_TENURES_ENABLED=true. */
  DAILY = 'DAILY',
  MONTHLY = 'MONTHLY',
  BI_MONTHLY = 'BI_MONTHLY',
  QUARTERLY = 'QUARTERLY',
  YEARLY = 'YEARLY',
}
