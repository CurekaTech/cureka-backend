export type GokwikCreateOrderResponse = {
  status: 'success' | 'failed';
  order_id: string;
  reason?: string;
};

export type GokwikPlaceOrderResponse = {
  status: 'success' | 'failed';
  order_id: string;
  thankyou_redirect_url: string;
  reason?: string;
};

export type GokwikCheckOrderExistsResponse = {
  order_id?: string;
  message: string;
};
