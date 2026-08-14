/**
 * Official GoKwik Update Order (`POST /v3/orders/update`) statuses.
 * @see GoKwik MCP api.checkout.update_order
 */
export type GokwikUpdateOrderStatus = 'Confirmed' | 'Pending' | 'Failed' | 'Cancelled';

/**
 * Request body for GoKwik Update Order API.
 * `merchant_order_id` and `order_note` are required by GoKwik.
 */
export type GokwikUpdateOrderRequest = {
  merchant_order_id: string;
  order_status?: GokwikUpdateOrderStatus;
  awb_number?: string;
  awb_status?: string;
  shipping_provider?: string;
  /** Required by GoKwik Update Order. Auto-filled from status when omitted. */
  order_note?: string;
  /** When set, GoKwik auto-initiates a refund for this amount. */
  refund_amount?: number;
};

export type GokwikUpdateOrderRefundData = {
  amount?: number;
  created_at?: string;
  payment_id?: string;
  refund_id?: string;
  status?: string;
};

/**
 * Response body for GoKwik Update Order API.
 */
export type GokwikUpdateOrderResponse = {
  status_code: number;
  success: boolean;
  error?: string;
  errors?: string;
  data?: GokwikUpdateOrderRefundData;
};
