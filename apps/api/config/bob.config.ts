import { registerAs } from '@nestjs/config';

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
};

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const bobConfig = registerAs('bob', () => ({
  /** Guest API key from support@businessonbot.com. Sent as `x-guest-id`. */
  guestId: (process.env['BOB_GUEST_ID'] ?? process.env['BOB_API_KEY'] ?? '').trim(),
  apiKey: (process.env['BOB_API_KEY'] ?? process.env['BOB_GUEST_ID'] ?? '').trim(),
  authRequired:
    process.env['BOB_AUTH_REQUIRED'] === 'true' || process.env['NODE_ENV'] === 'production',
  /** BusinessOnBot notify base, e.g. https://customstore.bonb.io/cureka — no /orders-create suffix. */
  notifyUrl: (process.env['BOB_NOTIFY_URL'] ?? '').trim(),
  /**
   * Shared secret for BOB → Cureka abandoned-cart webhook.
   * Header: `x-bob-webhook-secret`. Independent of GoKwik.
   */
  webhookSecret: (process.env['BOB_WEBHOOK_SECRET'] ?? '').trim(),
  timeoutMs: parseInt(process.env['BOB_TIMEOUT_MS'] ?? '15000', 10),
  abandonedCart: {
    /**
     * Starts with the API process (npm start / PM2). Set false to stop scheduling.
     * Still requires BOB_NOTIFY_URL.
     */
    enabled: parseBoolean(process.env['BOB_ABANDONED_CART_ENABLED'], true),
    scanIntervalMinutes: parsePositiveInt(process.env['BOB_ABANDONED_CART_SCAN_INTERVAL_MINUTES'], 30),
    inactivityMinutes: parsePositiveInt(process.env['BOB_ABANDONED_CART_INACTIVITY_MINUTES'], 30),
    cooldownHours: parsePositiveInt(process.env['BOB_ABANDONED_CART_COOLDOWN_HOURS'], 24),
    batchSize: parsePositiveInt(process.env['BOB_ABANDONED_CART_BATCH_SIZE'], 50),
    maxBatchesPerScan: parsePositiveInt(process.env['BOB_ABANDONED_CART_MAX_BATCHES_PER_SCAN'], 40),
    concurrency: parsePositiveInt(process.env['BOB_ABANDONED_CART_CONCURRENCY'], 2),
    maxAttempts: parsePositiveInt(process.env['BOB_ABANDONED_CART_MAX_ATTEMPTS'], 3),
  },
}));
