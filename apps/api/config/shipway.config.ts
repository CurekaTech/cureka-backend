import { registerAs } from '@nestjs/config';

export const shipwayConfig = registerAs('shipway', () => ({
  /** Shipway account email (used as Basic Auth username). */
  email: process.env['SHIPWAY_EMAIL'] ?? '',

  /** Shipway license key (used as Basic Auth password). */
  licenseKey: process.env['SHIPWAY_LICENSE_KEY'] ?? '',

  /** Shipway OMS API base URL (v2orders, getorders, tracking by AWB). */
  baseUrl: process.env['SHIPWAY_BASE_URL'] ?? 'https://app.shipway.com',

  /**
   * Classic order-tracking API host (getOrderShipmentDetails).
   * Shipway docs use https://shipway.in — this endpoint is NOT on app.shipway.com.
   */
  trackingBaseUrl:
    process.env['SHIPWAY_TRACKING_BASE_URL'] ??
    process.env['SHIPWAY_CLASSIC_BASE_URL'] ??
    'https://shipway.in',

  /**
   * Warehouse ID registered in Shipway.
   * Required for label-generation mode (push order with AWB assignment).
   * Leave empty to use tracking-only mode.
   */
  warehouseId: process.env['SHIPWAY_WAREHOUSE_ID'] ?? '',

  /** Return warehouse ID registered in Shipway. Defaults to warehouseId if not set. */
  returnWarehouseId: process.env['SHIPWAY_RETURN_WAREHOUSE_ID'] ?? '',

  /**
   * Optional Carrier ID to force a specific courier.
   * When empty, Shipway will auto-select based on serviceability.
   */
  carrierId: process.env['SHIPWAY_CARRIER_ID'] ? parseInt(process.env['SHIPWAY_CARRIER_ID'], 10) : undefined,

  /**
   * Webhook secret provided by Shipway for signature verification.
   * If empty, signature validation is skipped (not recommended for production).
   */
  webhookSecret: process.env['SHIPWAY_WEBHOOK_SECRET'] ?? '',

  /** HTTP request timeout in milliseconds for all Shipway API calls. */
  timeoutMs: parseInt(process.env['SHIPWAY_TIMEOUT_MS'] ?? '15000', 10),

  /** Fallback parcel weight in grams when order item variants do not have weight data. */
  defaultWeightGrams: parseFloat(process.env['SHIPWAY_DEFAULT_WEIGHT_GRAMS'] ?? '500'),

  /** Fallback parcel dimensions in centimeters when item variants do not have dimensions. */
  defaultLengthCm: parseFloat(process.env['SHIPWAY_DEFAULT_LENGTH_CM'] ?? '10'),
  defaultBreadthCm: parseFloat(process.env['SHIPWAY_DEFAULT_BREADTH_CM'] ?? '10'),
  defaultHeightCm: parseFloat(process.env['SHIPWAY_DEFAULT_HEIGHT_CM'] ?? '5'),
}));
