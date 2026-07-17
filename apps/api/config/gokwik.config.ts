import { registerAs } from '@nestjs/config';

export const gokwikConfig = registerAs('gokwik', () => ({
  baseUrl: (process.env['GOKWIK_BASE_URL'] ?? '').replace(/\/+$/, ''),
  appId: process.env['GOKWIK_APP_ID'] ?? '',
  appSecret: process.env['GOKWIK_APP_SECRET'] ?? '',
  merchantId: process.env['GOKWIK_MERCHANT_ID'] ?? '',
  timeoutMs: parseInt(process.env['GOKWIK_TIMEOUT_MS'] ?? '15000', 10),
}));
