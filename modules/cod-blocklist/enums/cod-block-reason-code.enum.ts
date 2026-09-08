export enum CodBlockReasonCode {
  COD_BLOCKED_FOR_PINCODE = 'COD_BLOCKED_FOR_PINCODE',
  COD_BLOCKED_FOR_CUSTOMER = 'COD_BLOCKED_FOR_CUSTOMER',
}

export enum CodBlockMatchedBy {
  PINCODE = 'PINCODE',
  CUSTOMER = 'CUSTOMER',
}

export const COD_BLOCKED_FOR_PINCODE_MESSAGE =
  'Cash on Delivery is not available for this delivery location.';

export const COD_BLOCKED_FOR_CUSTOMER_MESSAGE =
  'Cash on Delivery is not available for this account. Please use an online payment method.';

export const COD_BLOCKLIST_DUPLICATE_PINCODE = 'COD_BLOCKLIST_DUPLICATE_PINCODE';
export const COD_BLOCKLIST_DUPLICATE_CUSTOMER = 'COD_BLOCKLIST_DUPLICATE_CUSTOMER';
