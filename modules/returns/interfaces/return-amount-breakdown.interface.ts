/** Per-item contribution to the refundable amount of a return. */
export interface IReturnItemAmountBreakdown {
  returnRequestItemId: string | null;
  orderItemId: string;
  sku: string;
  quantity: number;
  unitPrice: string;
  grossAmount: string;
  /** Share of the order-level discount and coupon allocated to this item. */
  discountAllocation: string;
  couponAllocation: string;
  prepaidDiscountAllocation: string;
  netAmount: string;
}

/**
 * Immutable calculation trace persisted on the return request. Recomputed values
 * are never written back over an approved breakdown — it exists for audit.
 */
export interface IReturnAmountBreakdown {
  currency: string;
  /** Sum of item `netAmount` values. */
  itemsNetAmount: string;
  shippingRefundAmount: string;
  codFeeRefundAmount: string;
  handlingRefundAmount: string;
  nonRefundableChargesAmount: string;
  /** Amount before capping against what is still refundable on the order. */
  computedRefundAmount: string;
  /** Amount actually claimable after capping. */
  refundableAmount: string;
  orderCapturedAmount: string;
  orderAlreadyRefundedAmount: string;
  orderPendingRefundAmount: string;
  /** True when `computedRefundAmount` was reduced to fit the captured amount. */
  cappedByCapturedAmount: boolean;
  items: IReturnItemAmountBreakdown[];
  rules: {
    shippingRefundable: boolean;
    codFeeRefundable: boolean;
    handlingRefundable: boolean;
    roundingMode: 'HALF_UP_2DP';
  };
  calculatedAt: string;
}
