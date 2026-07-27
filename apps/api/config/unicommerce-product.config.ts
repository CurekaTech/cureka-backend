import { registerAs } from '@nestjs/config';

const envTrim = (value: string | undefined): string => (value ?? '').trim();

/**
 * Outbound product push to Unicommerce's official tenant API (OAuth 2.0).
 *
 * Step 1: POST /services/rest/v1/catalog/itemTypes/createOrEdit
 * Step 2: POST /services/rest/v1/catalog/channel/itemType/createOrEdit
 *
 * Credentials are shared with the inbound sync (UNICOMMERCE_USERNAME / PASSWORD).
 */
export const unicommerceProductConfig = registerAs('unicommerceProduct', () => ({
  /** Master switch. */
  enabled: envTrim(process.env['UNICOMMERCE_PRODUCT_PUSH_ENABLED']) === 'true',

  /** Tenant subdomain → https://{tenant}.unicommerce.com */
  tenant: envTrim(process.env['UNICOMMERCE_TENANT']) || 'stgcureka',

  /** OAuth username (same as inbound sync). */
  username: envTrim(process.env['UNICOMMERCE_USERNAME']),

  /** OAuth password. */
  password: envTrim(process.env['UNICOMMERCE_PASSWORD']),

  /** Channel code to map products to (default CUSTOM). */
  channel: envTrim(process.env['UNICOMMERCE_CHANNEL']) || 'CUSTOM',

  /**
   * Unicommerce category code. All products will be pushed under this category.
   * Must be pre-created in Unicommerce. Defaults to 'null' (accepted as placeholder).
   */
  categoryCode: envTrim(process.env['UNICOMMERCE_CATEGORY_CODE']) || 'null',

  /** Default HSN code for variants that don't have one. */
  defaultHsnCode: envTrim(process.env['UNICOMMERCE_DEFAULT_HSN_CODE']) || '',

  /** Product page base URL for links in Unicommerce catalog. */
  productBaseUrl: envTrim(process.env['UNICOMMERCE_PRODUCT_BASE_URL']) || '',

  /** HTTP request timeout in milliseconds. */
  timeoutMs: parseInt(
    envTrim(process.env['UNICOMMERCE_PRODUCT_PUSH_TIMEOUT_MS']) ||
      envTrim(process.env['UNICOMMERCE_ORDER_TIMEOUT_MS']) ||
      '15000',
    10,
  ),
}));
