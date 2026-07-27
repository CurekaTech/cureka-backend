import { registerAs } from '@nestjs/config';

/** Strip spaces / CR from .env values (Windows CRLF safety). */
function envTrim(value: string | undefined): string {
  return (value ?? '').trim();
}

/**
 * Outbound Unicommerce order integration using the official tenant API.
 *
 * Auth: OAuth 2.0 password grant → GET https://{tenant}.unicommerce.com/oauth/token
 * Create order: POST https://{tenant}.unicommerce.com/services/rest/v1/oms/saleOrder/create
 *   Headers: Authorization: bearer {token}, Facility: {facilityCode}
 */
export const unicommerceOrderConfig = registerAs('unicommerceOrder', () => ({
  /** Master switch. When false, orders are not pushed to Unicommerce. */
  enabled: envTrim(process.env['UNICOMMERCE_ORDER_PUSH_ENABLED']) === 'true',

  /**
   * Unicommerce tenant subdomain.
   * Base URL becomes: https://{tenant}.unicommerce.com
   */
  tenant: envTrim(process.env['UNICOMMERCE_TENANT']) || 'stgcureka',

  /** OAuth username — same credential used for inbound catalog sync. */
  username: envTrim(process.env['UNICOMMERCE_USERNAME']),

  /** OAuth password. */
  password: envTrim(process.env['UNICOMMERCE_PASSWORD']),

  /** Channel code registered in Unicommerce for Cureka's storefront. */
  channel: envTrim(process.env['UNICOMMERCE_CHANNEL']) || 'CUSTOM',

  /**
   * Facility code sent as the Facility request header.
   * Typically the same as the tenant name (e.g. stgcureka).
   */
  facilityCode: (() => {
    const raw = envTrim(process.env['UNICOMMERCE_DEFAULT_FACILITY_CODE']);
    if (!raw || raw === '{}' || raw === 'null' || raw === 'undefined') return '';
    return raw;
  })(),

  /** ISO currency code sent with prices. */
  currency: envTrim(process.env['UNICOMMERCE_ORDER_CURRENCY']) || 'INR',

  /** HTTP request timeout in milliseconds. */
  timeoutMs: parseInt(envTrim(process.env['UNICOMMERCE_ORDER_TIMEOUT_MS']) || '15000', 10),
}));
