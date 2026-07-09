import { registerAs } from '@nestjs/config';

/**
 * Outbound UniCommerce "Post Orders" integration.
 *
 * Cureka pushes newly created orders to UniCommerce's generic proxy:
 *   POST {baseUrl}/uc/v1/order
 * Auth is via static headers issued by UniCommerce (clientid / merchantid / securitykey).
 */
export const unicommerceOrderConfig = registerAs('unicommerceOrder', () => ({
  /** Master switch. When false, orders are not pushed to UniCommerce. */
  enabled: (process.env['UNICOMMERCE_ORDER_PUSH_ENABLED'] ?? 'false') === 'true',

  /** UniCommerce generic proxy base URL. */
  baseUrl:
    process.env['UNICOMMERCE_ORDER_BASE_URL'] ?? 'https://genericproxy.unicommerce.com',

  /** Post Orders endpoint path. */
  endpoint: process.env['UNICOMMERCE_ORDER_ENDPOINT'] ?? '/uc/v1/order',

  /** clientid header — provided by UniCommerce. */
  clientId: process.env['UNICOMMERCE_ORDER_CLIENT_ID'] ?? '',

  /** merchantid header — the seller username (falls back to inbound UNICOMMERCE_USERNAME). */
  merchantId:
    process.env['UNICOMMERCE_ORDER_MERCHANT_ID'] ??
    process.env['UNICOMMERCE_USERNAME'] ??
    '',

  /** securitykey header — static key provided by UniCommerce. */
  securityKey: process.env['UNICOMMERCE_ORDER_SECURITY_KEY'] ?? '',

  /** Default channel warehouse / facility code sent per order item. */
  facilityCode: process.env['UNICOMMERCE_DEFAULT_FACILITY_CODE'] ?? '',

  /** ISO currency code sent with prices. */
  currency: process.env['UNICOMMERCE_ORDER_CURRENCY'] ?? 'INR',

  /** SLA window (hours) added to order date for UniCommerce fulfilment alerts. */
  slaHours: parseInt(process.env['UNICOMMERCE_ORDER_SLA_HOURS'] ?? '48', 10),

  /** HTTP request timeout in milliseconds. */
  timeoutMs: parseInt(process.env['UNICOMMERCE_ORDER_TIMEOUT_MS'] ?? '15000', 10),
}));
