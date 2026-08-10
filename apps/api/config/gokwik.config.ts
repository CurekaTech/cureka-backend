import { registerAs } from '@nestjs/config';

/** Returns empty string for values that are placeholder comments like "<from GoKwik>". */
function sanitizePlaceholder(value: string | undefined): string {
  const v = (value ?? '').trim();
  return v.startsWith('<') || v === '' ? '' : v;
}

/**
 * Normalize outbound GoKwik API host.
 * Paths in code already include `/v3/...` (product/collection/orders).
 * If env has `https://gkx.gokwik.co/v3`, strip the trailing `/v3` to avoid
 * `.../v3/v3/product/update-product-details`.
 * Keep sandbox prefixes like `https://api-gw-v4.dev.gokwik.io/sandbox`.
 */
function normalizeGokwikBaseUrl(value: string | undefined): string {
  let base = (value ?? '').trim().replace(/\/+$/, '');
  if (!base) return '';
  // Only strip a trailing /v3 segment (production host style), not /sandbox.
  if (/\/v3$/i.test(base)) {
    base = base.replace(/\/v3$/i, '');
  }
  return base;
}

export const gokwikConfig = registerAs('gokwik', () => ({
  baseUrl: normalizeGokwikBaseUrl(process.env['GOKWIK_BASE_URL']),
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
    // URL shared by GoKwik (e.g. https://sandbox.pdp.gokwik.co).
    // Leave empty to auto-derive from environment.
    baseUrl: sanitizePlaceholder(process.env['KWIKPASS_BASE_URL']),
    // Treat placeholder values like "<from GoKwik>" as unset — an incorrect
    // value here causes every token to fail with "issuer / audience mismatch".
    issuer: sanitizePlaceholder(process.env['KWIKPASS_JWE_ISSUER']),
    audience: sanitizePlaceholder(process.env['KWIKPASS_JWE_AUDIENCE']),
  },
  timeoutMs: parseInt(process.env['GOKWIK_TIMEOUT_MS'] ?? '15000', 10),
}));
