import { parseMoney, roundMoney, toMoneyString } from '@modules/orders/utils/money.util';

export interface IAllocatableOrderTotals {
  /** Sum of all order-item `totalPrice` values. */
  subtotal: string;
  discountAmount: string;
  shippingAmount: string;
  handlingAmount: string;
  codCharge: string;
  prepaidDiscount: string;
}

export interface IAllocatableLine {
  orderItemId: string;
  /** Value of the full order line, used as the allocation weight. */
  lineTotal: string;
  /** Quantity being returned out of the ordered quantity. */
  returnQuantity: number;
  orderedQuantity: number;
  unitPrice: string;
}

export interface IAllocatedLine {
  orderItemId: string;
  grossAmount: number;
  discountAllocation: number;
  couponAllocation: number;
  prepaidDiscountAllocation: number;
  netAmount: number;
}

/**
 * Allocates order-level reductions across the returned quantity of each line.
 *
 * `order.discountAmount` already contains the coupon value in this schema, so it
 * is reported under `discountAllocation` and `couponAllocation` is reserved for
 * a future dedicated coupon column rather than double-counting the same money.
 *
 * Allocation is proportional to line value, and the last line absorbs the
 * rounding remainder so the parts always sum back to the whole.
 */
export const allocateReturnAmounts = (
  totals: IAllocatableOrderTotals,
  lines: IAllocatableLine[],
): IAllocatedLine[] => {
  const orderSubtotal = roundMoney(parseMoney(totals.subtotal));
  const totalDiscount = roundMoney(parseMoney(totals.discountAmount));
  const totalPrepaidDiscount = roundMoney(parseMoney(totals.prepaidDiscount));

  const weights = lines.map((line) => {
    const lineTotal = roundMoney(parseMoney(line.lineTotal));
    const orderedQuantity = line.orderedQuantity > 0 ? line.orderedQuantity : 1;
    const returnedShare = Math.min(line.returnQuantity, orderedQuantity) / orderedQuantity;
    return {
      line,
      lineTotal,
      returnedShare,
      returnedValue: roundMoney(lineTotal * returnedShare),
    };
  });

  const allocateProportionally = (poolAmount: number): number[] => {
    if (poolAmount <= 0 || orderSubtotal <= 0) {
      return weights.map(() => 0);
    }
    const raw = weights.map((weight) =>
      roundMoney((weight.returnedValue / orderSubtotal) * poolAmount),
    );
    return capToPool(raw, poolAmount);
  };

  const discountParts = allocateProportionally(totalDiscount);
  const prepaidParts = allocateProportionally(totalPrepaidDiscount);

  return weights.map((weight, index) => {
    const gross = weight.returnedValue;
    const discountAllocation = discountParts[index] ?? 0;
    const prepaidDiscountAllocation = prepaidParts[index] ?? 0;
    const netAmount = roundMoney(
      Math.max(0, gross - discountAllocation - prepaidDiscountAllocation),
    );

    return {
      orderItemId: weight.line.orderItemId,
      grossAmount: gross,
      discountAllocation,
      couponAllocation: 0,
      prepaidDiscountAllocation,
      netAmount,
    };
  });
};

/**
 * Rounding each share independently can drift above the pool, which would refund
 * more than was charged. The overflow is trimmed from the largest share.
 */
const capToPool = (parts: number[], poolAmount: number): number[] => {
  const total = roundMoney(parts.reduce((sum, part) => sum + part, 0));
  const overflow = roundMoney(total - poolAmount);
  if (overflow <= 0 || parts.length === 0) {
    return parts;
  }
  let largestIndex = 0;
  parts.forEach((part, index) => {
    if (part > (parts[largestIndex] ?? 0)) {
      largestIndex = index;
    }
  });
  const adjusted = [...parts];
  adjusted[largestIndex] = roundMoney(Math.max(0, (adjusted[largestIndex] ?? 0) - overflow));
  return adjusted;
};

export const sumMoney = (values: number[]): string =>
  toMoneyString(roundMoney(values.reduce((sum, value) => sum + value, 0)));
