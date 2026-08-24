/** Incoming / outgoing correlation header (canonical). */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Alternate correlation header accepted from clients. */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/** Default `service` field written on every log line. */
export const LOG_SERVICE_NAME = 'cureka-backend';

/** URL path fragments ignored by pino-http access logs. */
export const LOG_IGNORE_PATH_FRAGMENTS = ['/health'] as const;

/**
 * Field names redacted at the log root, one level down, and two levels down.
 * Pino's `*.key` wildcard is a single level only, so each depth is listed.
 */
export const LOG_REDACT_KEYS = [
  'authorization',
  'cookie',
  'password',
  'passwordConfirmation',
  'password_confirmation',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'token',
  'otp',
  'apiKey',
  'api_key',
  'apikey',
  'secret',
  'cardNumber',
  'card_number',
  'cvv',
  'cvc',
  'email',
  'phone',
  'mobile',
  'mobileNumber',
  'phoneNumber',
  'prescription',
  'patient',
  'patientName',
  'patientInfo',
  'signature',
  'licenseKey',
  'sessionToken',
] as const;

function expandRedactKey(key: string): string[] {
  return [key, `*.${key}`, `*.*.${key}`, `req.body.${key}`, `req.headers.${key}`];
}

/**
 * pino-http / pino redact paths (`remove: true` so values never appear).
 * Header names are lowercase (Node IncomingMessage).
 */
export const LOG_REDACT_PATHS: string[] = [
  ...LOG_REDACT_KEYS.flatMap(expandRedactKey),

  // Hyphenated / integration headers (bracket notation required)
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  'req.headers["x-bob-api-key"]',
  'req.headers["x-gokwik-callback-secret"]',
  'req.headers["x-webhook-signature"]',
  'req.headers["x-razorpay-signature"]',
  'req.headers["x-cashfree-signature"]',
  'req.headers["x-shipway-signature"]',
  'req.headers["x-shiprocket-signature"]',
];
