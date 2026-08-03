/** OAuth 2.0 token response from Unicommerce. */
export interface IUnicommerceOAuthTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
}

export interface IUnicommerceSaleOrderAddress {
  id: string;
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  country?: string;
  pincode?: string;
  phone: string;
  email?: string;
}

export interface IUnicommerceSaleOrderItem {
  /** Unique item code within the order, e.g. "ORD-001-1". */
  code: string;
  itemSku: string;
  shippingMethodCode: string;
  packetNumber?: number;
  giftWrap: boolean;
  giftMessage?: string;
  facilityCode?: string;
  totalPrice: string;
  sellingPrice: string;
  prepaidAmount: string;
  discount: string;
  shippingCharges: string;
  giftWrapCharges?: string;
  storeCredit?: string;
}

export interface IUnicommerceSaleOrderPayload {
  saleOrder: {
    code: string;
    displayOrderCode: string;
    displayOrderDateTime: string;
    channel: string;
    notificationEmail?: string;
    notificationMobile?: string;
    cashOnDelivery: boolean;
    paymentInstrument?: string;
    /** false = self-ship (Shipway); UC defaults true (marketplace) which breaks prepaid on custom channels. */
    thirdPartyShipping?: boolean;
    verificationRequired?: boolean;
    addresses: IUnicommerceSaleOrderAddress[];
    billingAddress: { referenceId: string };
    shippingAddress: { referenceId: string };
    saleOrderItems: IUnicommerceSaleOrderItem[];
    currencyCode?: string;
    totalDiscount?: number;
    totalShippingCharges?: number;
    totalCashOnDeliveryCharges?: number;
    totalPrepaidAmount?: number;
    totalGiftWrapCharges?: number;
    totalStoreCredit?: number;
    fulfillmentTat?: string;
  };
}

export interface IUnicommerceCreateSaleOrderResponse {
  successful: boolean;
  message?: string;
  errors?: Array<{
    code?: number;
    fieldName?: string;
    description?: string;
    message?: string;
  }>;
  warnings?: Array<{
    code?: number;
    message?: string;
    description?: string;
  }>;
  saleOrderDetailDTO?: {
    code?: string;
    displayOrderCode?: string;
    status?: string;
    created?: string;
    updated?: string;
  };
}
