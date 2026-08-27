import { registerAs } from '@nestjs/config';

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
}));
