/**
 * Typed interfaces for Shipway REST API request and response payloads.
 * These represent the raw shapes from the Shipway API — not our internal models.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Push Order (POST /api/v2orders)
// ──────────────────────────────────────────────────────────────────────────────

export interface IShipwayOrderProduct {
  product: string;
  price: string;
  product_code: string;
  product_quantity: string;
  discount?: string;
  tax_rate?: string;
  tax_title?: string;
  hsn_code?: string;
}

export interface IShipwayPushOrderPayload {
  order_id: string;
  payment_type: 'P' | 'C'; // P = Prepaid, C = COD
  products: IShipwayOrderProduct[];

  // Shipping address (required)
  shipping_firstname: string;
  shipping_lastname?: string;
  shipping_phone: string;
  shipping_address: string;
  shipping_address2?: string;
  shipping_city: string;
  shipping_state: string;
  shipping_zipcode: string;
  shipping_country: string;

  // Billing address (optional — defaults to shipping)
  billing_firstname?: string;
  billing_lastname?: string;
  billing_phone?: string;
  billing_address?: string;
  billing_address2?: string;
  billing_city?: string;
  billing_state?: string;
  billing_zipcode?: string;
  billing_country?: string;

  // Financials
  order_total?: string;
  discount?: string;
  shipping?: string;
  taxes?: string;
  gift_card_amt?: string;

  // Parcel details
  order_weight?: string; // grams
  box_length?: number;   // cms
  box_breadth?: number;  // cms
  box_height?: number;   // cms

  // Shipment booking (for label generation)
  carrier_id?: number;
  warehouse_id?: string;
  return_warehouse_id?: string;

  // Misc
  email?: string;
  order_date?: string; // yyyy-mm-dd hh:mm:ss
  ewaybill?: string;
}

export interface IShipwayPushOrderResponse {
  success: boolean;
  message: string;
  awb_number?: string;
  courier_name?: string;
  courier_id?: string | number;
  shipment_id?: string | number;
  tracking_url?: string;
  label_url?: string;
  invoice_url?: string;
  pickup_id?: string | number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Tracking (POST /api/getOrderShipmentDetails)
// Docs: JSON body { username, password, order_id }
// ──────────────────────────────────────────────────────────────────────────────

export interface IShipwayTrackingEvent {
  status: string;
  status_date: string;
  location?: string;
  message?: string;
  activity?: string;
  /** Classic Shipway scan field aliases */
  time?: string;
  status_detail?: string;
  details?: string;
}

export interface IShipwayTrackingResponse {
  success?: boolean;
  /** Classic API uses status: "Success" | "Error" */
  status?: string;
  message?: string;
  order_id?: string;
  awb_number?: string;
  courier_name?: string;
  courier_id?: string | number;
  current_status?: string;
  current_status_code?: string;
  /** Classic Shipway short code, e.g. RAD / INT / DEL */
  shipway_status?: string;
  current_status_date?: string;
  tracking_url?: string;
  label_url?: string;
  invoice_url?: string;
  pickup_id?: string | number;
  shipment_id?: string | number;
  events?: IShipwayTrackingEvent[];
  scans?: IShipwayTrackingEvent[];
  scan?: IShipwayTrackingEvent[];
  /** Classic API nests payload under `response` */
  response?: Omit<IShipwayTrackingResponse, 'response' | 'success' | 'status' | 'message'>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Cancel Shipment (POST /api/cancel)
// ──────────────────────────────────────────────────────────────────────────────

export interface IShipwayCancelPayload {
  awb_number: string;
  courier_id?: string | number;
  reason?: string;
}

export interface IShipwayCancelResponse {
  success: boolean;
  message: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Carrier List (GET /api/carriers)
// ──────────────────────────────────────────────────────────────────────────────

export interface IShipwayCarrier {
  id: number;
  name: string;
  min_weight?: number;
  max_weight?: number;
}

export interface IShipwayCarriersResponse {
  success: boolean;
  carriers?: IShipwayCarrier[];
  message?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Webhook Event
// Classic docs (shipway.in): { hash, status_feed: [{ order_id, current_status }] }
// Single-event / OMS-style: { order_id, status, event_id?, ... }
// ──────────────────────────────────────────────────────────────────────────────

export interface IShipwayStatusFeedItem {
  order_id: string;
  current_status?: string;
  status?: string;
  current_status_code?: string;
  awb?: string;
  awb_number?: string;
  awb_no?: string;
}

export interface IShipwayStatusFeedWebhook {
  hash: string;
  status_feed: IShipwayStatusFeedItem[];
}

export interface IShipwayWebhookEvent {
  event_id?: string;
  order_id: string;
  awb_number?: string;
  courier_name?: string;
  courier_id?: string | number;
  status: string;
  status_date?: string;
  location?: string;
  message?: string;
  tracking_url?: string;
  label_url?: string;
  invoice_url?: string;
  pickup_id?: string | number;
  shipment_id?: string | number;
  status_code?: string;
  current_status_code?: string;
  [key: string]: unknown;
}

// ──────────────────────────────────────────────────────────────────────────────
// NDR (Non-Delivery Report)
// ──────────────────────────────────────────────────────────────────────────────

export interface IShipwayNdrActionPayload {
  awb_number: string;
  action: 'reattempt' | 'rto';
  remarks?: string;
}

export interface IShipwayNdrResponse {
  success: boolean;
  message: string;
}
