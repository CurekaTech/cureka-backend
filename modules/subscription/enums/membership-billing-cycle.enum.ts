export enum MembershipBillingCycle {
  /** TechBV test tenure. Hidden unless SUBSCRIPTION_TEST_TENURES_ENABLED=true. */
  MINUTES_30 = 'MINUTES_30',
  /** TechBV test tenure. Hidden unless SUBSCRIPTION_TEST_TENURES_ENABLED=true. */
  HOURLY = 'HOURLY',
  /** TechBV test tenure (1 day). Hidden unless SUBSCRIPTION_TEST_TENURES_ENABLED=true. */
  DAILY = 'DAILY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  YEARLY = 'YEARLY',
}
