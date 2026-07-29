/** Incoming / outgoing correlation header (canonical). */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Alternate correlation header accepted from clients. */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/** URL path fragments ignored by pino-http access logs. */
export const LOG_IGNORE_PATH_FRAGMENTS = ['/health'] as const;

/**
 * pino-http redact paths (remove: true).
 * Keep in sync with webhook signature header names used by payment/shipping modules.
 */
export const LOG_REDACT_PATHS: string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-gokwik-callback-secret"]',
  'req.headers["x-webhook-signature"]',
  'req.headers["x-razorpay-signature"]',
  'req.headers["x-cashfree-signature"]',
  'req.headers["x-shipway-signature"]',
  'req.headers["x-shiprocket-signature"]',
  'req.body.password',
  'req.body.token',
  'req.body.otp',
  'req.body.refreshToken',
  'req.body.sessionToken',
  '*.signature',
  '*.secret',
  '*.licenseKey',
  '*.authorization',
];
