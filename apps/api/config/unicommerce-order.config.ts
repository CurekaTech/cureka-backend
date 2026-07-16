import { registerAs } from '@nestjs/config';

/** Strip spaces / CR from .env values (Windows CRLF breaks UniCommerce auth headers). */
function envTrim(value: string | undefined): string {
  return (value ?? '').trim();
}

/**
 * Outbound UniCommerce "Post Orders" integration.
 *
 * Cureka pushes newly created orders to UniCommerce's generic proxy:
 *   POST {baseUrl}/uc/v1/order
 * Auth is via static headers issued by UniCommerce (clientid / merchantid / securitykey).
 */
export const unicommerceOrderConfig = registerAs('unicommerceOrder', () => ({
  /** Master switch. When false, orders are not pushed to UniCommerce. */
  enabled: envTrim(process.env['UNICOMMERCE_ORDER_PUSH_ENABLED']) === 'true',

  /** UniCommerce generic proxy base URL. */
  baseUrl:
    envTrim(process.env['UNICOMMERCE_ORDER_BASE_URL']) ||
    'https://genericproxy.unicommerce.com',

  /** Post Orders endpoint path. */
  endpoint: envTrim(process.env['UNICOMMERCE_ORDER_ENDPOINT']) || '/uc/v1/order',

  /** clientid header — provided by UniCommerce. */
  clientId: envTrim(process.env['UNICOMMERCE_ORDER_CLIENT_ID']),

  /** merchantid header — the seller username (falls back to inbound UNICOMMERCE_USERNAME). */
  merchantId:
    envTrim(process.env['UNICOMMERCE_ORDER_MERCHANT_ID']) ||
    envTrim(process.env['UNICOMMERCE_USERNAME']),

  /** securitykey header — static key provided by UniCommerce. */
  securityKey: envTrim(process.env['UNICOMMERCE_ORDER_SECURITY_KEY']),

  /** Default channel warehouse / facility code sent per order item. */
  facilityCode: envTrim(process.env['UNICOMMERCE_DEFAULT_FACILITY_CODE']),

  /** ISO currency code sent with prices. */
  currency: envTrim(process.env['UNICOMMERCE_ORDER_CURRENCY']) || 'INR',

  /** SLA window (hours) added to order date for UniCommerce fulfilment alerts. */
  slaHours: parseInt(envTrim(process.env['UNICOMMERCE_ORDER_SLA_HOURS']) || '48', 10),

  /** HTTP request timeout in milliseconds. */
  timeoutMs: parseInt(envTrim(process.env['UNICOMMERCE_ORDER_TIMEOUT_MS']) || '15000', 10),
}));
