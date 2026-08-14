import { OrderEntity } from '@modules/orders/entities/order.entity';
import { parseMoney, roundMoney } from '@modules/orders/utils/money.util';
import {
  GokwikCreateOrderMetaDataDto,
  GokwikMetaDiscountDto,
  GokwikOtherChargeDto,
  GokwikPaymentDetailsDto,
} from '../dto/gokwik-create-order.dto';

export type GokwikFinancialSnapshot = {
  subtotal: number;
  discountAmount: number;
  prepaidDiscount: number;
  shippingAmount: number;
  handlingAmount: number;
  platformFee: number;
  codCharge: number;
  grandTotal: number;
  couponCode: string | null;
  couponTitle: string | null;
  rewardsAmount: number;
  source: 'gokwik';
};

function isPrepaidDiscount(discount: GokwikMetaDiscountDto): boolean {
  const type = String(discount.type ?? '').toLowerCase();
  const description = String(discount.description ?? '').toLowerCase();
  return type.includes('prepaid') || description.includes('prepaid');
}

function classifyCharge(
  charge: GokwikOtherChargeDto,
): 'cod' | 'handling' | 'platform' | 'shipping' | 'other' {
  const haystack = `${charge.charge_type} ${charge.label ?? ''} ${charge.description ?? ''}`.toLowerCase();
  if (haystack.includes('cod')) return 'cod';
  if (haystack.includes('handling')) return 'handling';
  if (haystack.includes('platform')) return 'platform';
  if (haystack.includes('shipping') || haystack.includes('delivery') || haystack.includes('freight')) {
    return 'shipping';
  }
  return 'other';
}

function sumPositive(amounts: number[]): number {
  return roundMoney(
    amounts.reduce((sum, amount) => {
      if (!Number.isFinite(amount) || amount < 0) return sum;
      return sum + amount;
    }, 0),
  );
}

/**
 * Build order money from GoKwik create/place payload.
 * Line-item subtotal stays from Cureka catalog; payable total / discounts / fees
 * come from GoKwik (their coupons own the commercial snapshot).
 */
export function buildGokwikFinancialSnapshot(params: {
  order: OrderEntity;
  payment: GokwikPaymentDetailsDto;
  meta?: GokwikCreateOrderMetaDataDto;
}): GokwikFinancialSnapshot {
  const { order, payment, meta } = params;
  const subtotal = roundMoney(parseMoney(order.subtotal));
  const discounts = meta?.discounts ?? [];

  const prepaidDiscount = sumPositive(
    discounts.filter(isPrepaidDiscount).map((discount) => Number(discount.amount)),
  );
  const couponDiscount = sumPositive(
    discounts.filter((discount) => !isPrepaidDiscount(discount)).map((discount) => Number(discount.amount)),
  );
  const rewardsAmount = roundMoney(
    Math.max(0, Number(meta?.rewards_info?.reward_amount ?? 0) || 0),
  );
  let discountAmount = roundMoney(couponDiscount + rewardsAmount);

  const chargeBuckets = {
    cod: 0,
    handling: 0,
    platform: 0,
    shipping: 0,
    other: 0,
  };
  let hasCodCharge = false;
  let hasHandlingCharge = false;
  let hasPlatformCharge = false;
  let hasShippingCharge = false;

  for (const charge of meta?.other_charges ?? []) {
    const amount = Number(charge.amount ?? 0);
    if (!Number.isFinite(amount) || amount < 0) continue;
    const bucket = classifyCharge(charge);
    chargeBuckets[bucket] = roundMoney(chargeBuckets[bucket] + amount);
    if (bucket === 'cod') hasCodCharge = true;
    if (bucket === 'handling') hasHandlingCharge = true;
    if (bucket === 'platform') hasPlatformCharge = true;
    if (bucket === 'shipping') hasShippingCharge = true;
  }

  const isCodLike = payment.payment_method === 'cod' || payment.payment_method === 'pp-cod';
  let handlingAmount = hasHandlingCharge
    ? chargeBuckets.handling
    : roundMoney(parseMoney(order.handlingAmount));
  let platformFee = hasPlatformCharge
    ? chargeBuckets.platform
    : roundMoney(parseMoney(order.platformFee));
  let codCharge = hasCodCharge
    ? chargeBuckets.cod
    : isCodLike
      ? roundMoney(parseMoney(order.codCharge))
      : 0;

  // Unknown fees fold into handling so UniCommerce shipping bucket stays consistent.
  if (chargeBuckets.other > 0) {
    handlingAmount = roundMoney(handlingAmount + chargeBuckets.other);
  }

  let grandTotal = roundMoney(Math.max(0, Number(payment.payment_amount) || 0));
  if (payment.payment_method === 'pp-cod') {
    const prepaid = meta?.ppcod?.prepaid_amount;
    const payable = meta?.ppcod?.payable_on_delivery;
    if (prepaid != null && payable != null) {
      grandTotal = roundMoney(Math.max(0, prepaid + payable));
    }
  }

  let shippingAmount: number;
  if (hasShippingCharge) {
    shippingAmount = chargeBuckets.shipping;
  } else {
    // Residual shipping so:
    // grandTotal = subtotal - discount - prepaid + shipping + handling + platform + cod
    shippingAmount = roundMoney(
      grandTotal - subtotal + discountAmount + prepaidDiscount - handlingAmount - platformFee - codCharge,
    );
    if (shippingAmount < 0) {
      // GoKwik discounted more than cart residual allows — keep shipping at 0 and
      // raise coupon discount so the identity still holds.
      shippingAmount = 0;
      discountAmount = roundMoney(
        Math.max(
          0,
          subtotal + handlingAmount + platformFee + codCharge - prepaidDiscount - grandTotal,
        ),
      );
    }
  }

  const couponDiscountLine =
    discounts.find((discount) => !isPrepaidDiscount(discount) && Boolean(discount.code?.trim())) ??
    discounts.find((discount) => !isPrepaidDiscount(discount));

  return {
    subtotal,
    discountAmount,
    prepaidDiscount,
    shippingAmount,
    handlingAmount,
    platformFee,
    codCharge,
    grandTotal,
    couponCode: couponDiscountLine?.code?.trim() || order.couponCode || null,
    couponTitle:
      couponDiscountLine?.description?.trim() ||
      couponDiscountLine?.type?.trim() ||
      order.couponTitle ||
      null,
    rewardsAmount,
    source: 'gokwik',
  };
}
