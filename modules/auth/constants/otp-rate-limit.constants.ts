export const OTP_RATE_LIMIT = {
  /** Max OTP sends per mobile number within the window. */
  MOBILE_MAX_REQUESTS: 3,
  /** Max OTP sends per IP within the window. */
  IP_MAX_REQUESTS: 15,
  /** Rate-limit window in seconds (15 minutes). */
  WINDOW_SECONDS: 15 * 60,
} as const;
