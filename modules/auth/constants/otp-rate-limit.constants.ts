export const OTP_RATE_LIMIT = {
  /** Max OTP sends per mobile number within the window. */
  MOBILE_MAX_REQUESTS: 5,
  /**
   * Max OTP sends per client IP within the window (all numbers combined).
   * Kept higher than mobile limit because offices / NAT / mobile carriers share IPs.
   */
  IP_MAX_REQUESTS: 60,
  /** Rate-limit window in seconds (15 minutes). */
  WINDOW_SECONDS: 15 * 60,
} as const;

export type OtpRateLimitCounter = {
  count: number;
  /** Epoch ms when this window expires. */
  resetAt: number;
};
