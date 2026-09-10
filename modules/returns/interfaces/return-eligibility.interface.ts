import { IOrderItemReturnPolicySnapshot } from '@modules/orders/interfaces/order-item-return-policy.interface';
import { ReturnResolution } from '../enums/return-resolution.enum';

/** Customer-safe reason an item cannot be returned. Never leaks internal detail. */
export type ReturnIneligibilityCode =
  | 'ITEM_NOT_DELIVERED'
  | 'DELIVERY_DATE_UNAVAILABLE'
  | 'RETURN_NOT_ALLOWED'
  | 'RETURN_WINDOW_EXPIRED'
  | 'RETURN_QUANTITY_EXCEEDED'
  | 'ACTIVE_RETURN_ALREADY_EXISTS'
  | 'ORDER_IS_RTO'
  | 'RETURN_POLICY_NOT_AVAILABLE';

export interface IReturnItemEligibility {
  orderItemId: string;
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  orderedQuantity: number;
  deliveredQuantity: number;
  /** Quantity held by earlier or in-flight returns. */
  committedQuantity: number;
  availableQuantity: number;
  unitPrice: string;

  canReturn: boolean;
  canReplace: boolean;
  canRequestRefund: boolean;

  deliveredAt: Date | null;
  returnWindowExpiresAt: Date | null;
  replacementWindowExpiresAt: Date | null;

  allowedResolutions: ReturnResolution[];
  ineligibilityCode: ReturnIneligibilityCode | null;
  ineligibilityMessage: string | null;

  policy: IOrderItemReturnPolicySnapshot;
}

export interface IOrderReturnEligibility {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  isRto: boolean;
  /** True when at least one item can be returned or replaced right now. */
  hasEligibleItems: boolean;
  items: IReturnItemEligibility[];
  paymentMethod?: string;
  codRefund?: {
    required: boolean;
    allowedMethods: string[];
    defaultMethod: string;
    walletEnabled: boolean;
    message: string | null;
  };
}
