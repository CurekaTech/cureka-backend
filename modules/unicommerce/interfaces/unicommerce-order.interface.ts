/** UniCommerce "Post Orders" order status (allowable set from the spec). */
export type UnicommerceOrderStatus = 'PENDING_VERIFICATION' | 'CREATED' | 'CANCELLED';

/** UniCommerce "Post Orders" order-item status (allowable set from the spec). */
export type UnicommerceOrderItemStatus =
  | 'CANCELLED'
  | 'CREATED'
  | 'DISPATCHED'
  | 'DELIVERED';

export type UnicommercePaymentType = 'COD' | 'PREPAID';

export interface IUnicommerceOrderPrice {
  currency: string;
  totalCashOnDeliveryCharges: number;
  totalDiscount: number;
  totalGiftCharges: number;
  totalStoreCredit: number;
  totalPrepaidAmount: number;
  totalShippingCharges: number;
}

export interface IUnicommerceOrderItemPrice {
  cashOnDeliveryCharges: number;
  sellingPrice: number;
  shippingCharges: number;
  discount: number;
  totalPrice: number;
  transferPrice: number;
  currency: string;
}

export interface IUnicommerceOrderItem {
  orderItemId: string;
  status: UnicommerceOrderItemStatus;
  productId: string;
  variantId: string;
  sku: string;
  title: string;
  shippingMethodCode: string;
  orderItemPrice: IUnicommerceOrderItemPrice;
  quantity: number;
  onHold: boolean;
  packetNumber: number;
  facilityCode?: string;
}

export interface IUnicommerceAddress {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  country: string;
  email?: string;
  name: string;
  phone: string;
  pincode: string;
  state: string;
}

export interface IUnicommercePostOrderPayload {
  id: string;
  displayOrderNumber: string;
  orderDate: string;
  orderStatus: UnicommerceOrderStatus;
  sla: string;
  priority: number;
  paymentType: UnicommercePaymentType;
  orderPrice: IUnicommerceOrderPrice;
  orderItems: IUnicommerceOrderItem[];
  taxExempted: boolean;
  cFormProvided: boolean;
  thirdPartyShipping: boolean;
  shippingAddress: IUnicommerceAddress;
  billingAddress: IUnicommerceAddress;
  additionalInfo?: string;
}

export interface IUnicommercePostOrderResponse {
  status?: string;
  message?: string;
  data?: unknown;
}
