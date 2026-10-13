export enum RefundReason {
  CUSTOMER_CANCELLATION = 'CUSTOMER_CANCELLATION',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  WRONG_PRODUCT = 'WRONG_PRODUCT',
  DELAYED_DELIVERY = 'DELAYED_DELIVERY',
  RTO = 'RTO',
  DAMAGED_PRODUCT = 'DAMAGED_PRODUCT',
  /** Refund raised by an approved, received and QC-passed return. */
  PRODUCT_RETURN = 'PRODUCT_RETURN',
  /** Bank refund of a replacement that costs less than the historical order price. */
  REPLACEMENT_PRICE_DIFFERENCE = 'REPLACEMENT_PRICE_DIFFERENCE',
  OTHER = 'OTHER',
}
