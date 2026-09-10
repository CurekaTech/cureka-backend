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
    /** Coupon / notes text shown on the Uniware order (max 500 chars). */
    additionalInfo?: string;
  };
}

export interface IUnicommerceApiError {
  code?: number;
  fieldName?: string;
  description?: string;
  message?: string;
}

export interface IUnicommerceCreateSaleOrderResponse {
  successful: boolean;
  message?: string;
  errors?: IUnicommerceApiError[];
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

/** Item row from GET /services/rest/v1/oms/saleorder/get */
export interface IUnicommerceSaleOrderItemDto {
  code?: string;
  itemSku?: string;
  statusCode?: string;
}

export interface IUnicommerceGetSaleOrderResponse {
  successful: boolean;
  message?: string;
  errors?: IUnicommerceApiError[];
  saleOrderDTO?: {
    code?: string;
    displayOrderCode?: string;
    status?: string;
    saleOrderItems?: IUnicommerceSaleOrderItemDto[];
  };
}

/**
 * Official reverse-pickup create body.
 * Docs: POST /services/rest/v1/oms/reversePickup/create
 * https://documentation.unicommerce.com/docs/create-reversepickup.html
 */
export interface IUnicommerceReversePickupAddress {
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

export interface IUnicommerceReversePickItem {
  saleOrderItemCode: string;
  reason: string;
  customerImageUrl?: string;
  reversePickupAlternate?: {
    itemSku: string;
    totalPrice?: number;
    sellingPrice?: number;
    discount?: number;
    shippingCharges?: number;
    prepaidAmount?: number;
  };
}

export interface IUnicommerceCreateReversePickupPayload {
  saleOrderCode: string;
  reversePickItems: IUnicommerceReversePickItem[];
  actionCode: 'WAC';
  reversePickupCode?: string;
  pickupAddress?: IUnicommerceReversePickupAddress;
  shippingAddress?: IUnicommerceReversePickupAddress;
  pickupInstruction?: string;
  returnFacilityCode?: string;
}

export interface IUnicommerceCreateReversePickupResponse {
  successful: boolean;
  message?: string;
  errors?: IUnicommerceApiError[];
  reversePickupCode?: string;
  reversePickupDTO?: {
    code?: string;
    reversePickupCode?: string;
    status?: string;
  };
}
