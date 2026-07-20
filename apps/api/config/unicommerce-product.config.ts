import { registerAs } from '@nestjs/config';

const envTrim = (value: string | undefined): string => (value ?? '').trim();

export const unicommerceProductConfig = registerAs('unicommerceProduct', () => ({
  enabled: envTrim(process.env['UNICOMMERCE_PRODUCT_PUSH_ENABLED']) === 'true',
  baseUrl:
    envTrim(process.env['UNICOMMERCE_PRODUCT_PUSH_BASE_URL']) ||
    envTrim(process.env['UNICOMMERCE_ORDER_BASE_URL']) ||
    'https://genericproxy.unicommerce.com',
  // No guessed default: UniCommerce must provide the merchant-specific product endpoint.
  endpoint: envTrim(process.env['UNICOMMERCE_PRODUCT_PUSH_ENDPOINT']),
  clientId: envTrim(process.env['UNICOMMERCE_ORDER_CLIENT_ID']),
  merchantId:
    envTrim(process.env['UNICOMMERCE_ORDER_MERCHANT_ID']) ||
    envTrim(process.env['UNICOMMERCE_USERNAME']),
  securityKey: envTrim(process.env['UNICOMMERCE_ORDER_SECURITY_KEY']),
  timeoutMs: parseInt(
    envTrim(process.env['UNICOMMERCE_PRODUCT_PUSH_TIMEOUT_MS']) ||
      envTrim(process.env['UNICOMMERCE_ORDER_TIMEOUT_MS']) ||
      '15000',
    10,
  ),
}));
