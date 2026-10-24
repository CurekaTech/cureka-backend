export enum ProductSubscriptionFrequency {
  /** TechBV test tenure. Hidden unless SUBSCRIPTION_TEST_TENURES_ENABLED=true. */
  MINUTES_2 = 'MINUTES_2',
  /** TechBV test tenure. Hidden unless SUBSCRIPTION_TEST_TENURES_ENABLED=true. */
  MINUTES_5 = 'MINUTES_5',
  /** TechBV test tenure. Hidden unless SUBSCRIPTION_TEST_TENURES_ENABLED=true. */
  MINUTES_30 = 'MINUTES_30',
  /** TechBV test tenure. Hidden unless SUBSCRIPTION_TEST_TENURES_ENABLED=true. */
  HOURLY = 'HOURLY',
  /** TechBV test tenure (1 day). Hidden unless SUBSCRIPTION_TEST_TENURES_ENABLED=true. */
  DAILY = 'DAILY',
  MONTHLY = 'MONTHLY',
  BI_MONTHLY = 'BI_MONTHLY',
  QUARTERLY = 'QUARTERLY',
}
