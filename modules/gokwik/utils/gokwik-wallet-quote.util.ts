import { BadRequestException } from '@nestjs/common';

export type GokwikWalletCheckoutQuote = {
  subtotal: number;
  shippingAmount: number;
  discountAmount: number;
  finalCartTotal: number;
};

export type GokwikWalletQuoteInput = {
  subtotal?: number;
  shipping_amount?: number;
  shipping?: number;
  shipping_total?: number;
  discount_amount?: number;
  discount?: number;
  discount_total?: number;
  final_cart_total?: number;
  final_total?: number;
  cart_total?: number;
};

function readRupee(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new BadRequestException({
      error: `${field} must be a non-negative number`,
      code: 'GOKWIK_WALLET_INVALID_QUOTE',
      field,
    });
  }
  return amount;
}

function wholeRupees(amount: number): number {
  return Math.floor(amount);
}

/**
 * GoKwik owns discount + shipping on checkout. When they send those totals,
 * wallet credit must be sized against that payable — not Cureka's stale cart shipping.
 */
export function resolveGokwikWalletCheckoutQuote(
  input: GokwikWalletQuoteInput,
): GokwikWalletCheckoutQuote | null {
  const subtotal = readRupee(input.subtotal, 'subtotal');
  const shippingAmount = readRupee(
    input.shipping_amount ?? input.shipping_total ?? input.shipping,
    'shipping_amount',
  );
  const discountAmount = readRupee(
    input.discount_amount ?? input.discount_total ?? input.discount,
    'discount_amount',
  ) ?? 0;
  const finalCartTotal = readRupee(
    input.final_cart_total ?? input.final_total ?? input.cart_total,
    'final_cart_total',
  );

  const hasQuote =
    subtotal !== undefined ||
    shippingAmount !== undefined ||
    input.discount_amount !== undefined ||
    input.discount_total !== undefined ||
    input.discount !== undefined ||
    finalCartTotal !== undefined;
  if (!hasQuote) return null;

  if (finalCartTotal === undefined && (subtotal === undefined || shippingAmount === undefined)) {
    throw new BadRequestException({
      error:
        'apply-wallet-credit quote requires final_cart_total, or both subtotal and shipping_amount',
      code: 'GOKWIK_WALLET_INCOMPLETE_QUOTE',
    });
  }

  const fromParts =
    subtotal !== undefined && shippingAmount !== undefined
      ? Math.max(0, subtotal + shippingAmount - discountAmount)
      : undefined;
  const payable = finalCartTotal ?? fromParts;
  if (payable === undefined) {
    throw new BadRequestException({
      error: 'apply-wallet-credit quote is incomplete',
      code: 'GOKWIK_WALLET_INCOMPLETE_QUOTE',
    });
  }

  return {
    subtotal: wholeRupees(subtotal ?? Math.max(0, payable - (shippingAmount ?? 0) + discountAmount)),
    shippingAmount: wholeRupees(shippingAmount ?? 0),
    discountAmount: wholeRupees(discountAmount),
    finalCartTotal: wholeRupees(payable),
  };
}

/**
 * Wallet may cover GoKwik shipping, but not an unbounded caller-supplied total.
 * Cap at Cureka merchandise/fees plus the GoKwik shipping they sent.
 */
export function capGokwikWalletEligibleRupees(params: {
  quotePayableRupees: number;
  curekaSubtotalRupees: number;
  curekaFeeRupees: number;
  gokwikShippingRupees: number;
  gokwikDiscountRupees: number;
}): number {
  const cap = Math.max(
    0,
    wholeRupees(params.curekaSubtotalRupees) +
      wholeRupees(params.curekaFeeRupees) +
      wholeRupees(params.gokwikShippingRupees) -
      wholeRupees(params.gokwikDiscountRupees),
  );
  return Math.min(wholeRupees(params.quotePayableRupees), cap);
}
