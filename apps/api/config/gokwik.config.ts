import { registerAs } from '@nestjs/config';

export const gokwikConfig = registerAs('gokwik', () => ({
  baseUrl: (process.env['GOKWIK_BASE_URL'] ?? '').replace(/\/+$/, ''),
  appId: process.env['GOKWIK_APP_ID'] ?? '',
  appSecret: process.env['GOKWIK_APP_SECRET'] ?? '',
  merchantId: process.env['GOKWIK_MERCHANT_ID'] ?? '',
  callbackSecret: process.env['GOKWIK_CALLBACK_SECRET'] ?? '',
  callbackAuthRequired:
    process.env['GOKWIK_CALLBACK_AUTH_REQUIRED'] === 'true' ||
    process.env['NODE_ENV'] === 'production',
  webhookEnabled: process.env['GOKWIK_WEBHOOK_ENABLED'] === 'true',
  webhookSecret: process.env['GOKWIK_WEBHOOK_SECRET'] ?? '',
  catalogSyncEnabled: process.env['GOKWIK_CATALOG_SYNC_ENABLED'] === 'true',
  origin: {
    city: process.env['GOKWIK_ORIGIN_CITY'] ?? '',
    state: process.env['GOKWIK_ORIGIN_STATE'] ?? '',
    pincode: process.env['GOKWIK_ORIGIN_PINCODE'] ?? '',
    country: process.env['GOKWIK_ORIGIN_COUNTRY'] ?? 'India',
  },
  kwikpass: {
    environment: process.env['KWIKPASS_ENVIRONMENT'] ?? 'sandbox',
    merchantId: process.env['KWIKPASS_MERCHANT_ID'] ?? '',
    jweSecret: process.env['KWIKPASS_JWE_SECRET'] ?? '',
    issuer: process.env['KWIKPASS_JWE_ISSUER'] ?? '',
    audience: process.env['KWIKPASS_JWE_AUDIENCE'] ?? '',
  },
  timeoutMs: parseInt(process.env['GOKWIK_TIMEOUT_MS'] ?? '15000', 10),
}));
