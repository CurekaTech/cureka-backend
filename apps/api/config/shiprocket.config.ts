import { registerAs } from '@nestjs/config';

export const shiprocketConfig = registerAs('shiprocket', () => ({
  email: process.env['SHIPROCKET_EMAIL'] ?? process.env['SHIPWAY_EMAIL'] ?? '',
  licenseKey: process.env['SHIPROCKET_LICENSE_KEY'] ?? process.env['SHIPWAY_LICENSE_KEY'] ?? '',
  baseUrl: process.env['SHIPROCKET_BASE_URL'] ?? process.env['SHIPWAY_BASE_URL'] ?? 'https://app.shipway.com',
  timeoutMs: parseInt(process.env['SHIPROCKET_TIMEOUT_MS'] ?? process.env['SHIPWAY_TIMEOUT_MS'] ?? '15000', 10),
  checkoutSessionPath: process.env['SHIPROCKET_CHECKOUT_SESSION_PATH'] ?? '/api/checkout/session',
  checkoutVerifyPath: process.env['SHIPROCKET_CHECKOUT_VERIFY_PATH'] ?? '/api/checkout/session/:sessionId',
  webhookSecret: process.env['SHIPROCKET_CHECKOUT_WEBHOOK_SECRET'] ?? '',
}));
