import { GOKWIK_COMPLIMENTARY_LINE_SOURCE } from '../constants/gokwik-line-item.constants';
import { GokwikLineItemDto } from '../dto/gokwik-line-item.dto';

export type GokwikComplimentaryLineItemMeta = {
  source: typeof GOKWIK_COMPLIMENTARY_LINE_SOURCE;
  couponCode: string | null;
  gokwikPrice: number | null;
  gokwikMrp: number | null;
};

export type GokwikLineItemsLogSummary = {
  present: boolean;
  totalCount: number;
  complimentaryCount: number;
  expectedComplimentarySource: typeof GOKWIK_COMPLIMENTARY_LINE_SOURCE;
  sources: Array<string | null>;
  items: Array<{
    productId: string | null;
    variantId: string | null;
    quantity: number | null;
    price: number | null;
    mrp: number | null;
    discount: number | null;
    source: string | null;
    title: string | null;
    discountedItem: boolean | null;
    discountCodes: string[];
    isComplimentary: boolean;
  }>;
};

export function isGokwikComplimentaryLineItem(
  lineItem: Pick<GokwikLineItemDto, 'source'>,
): boolean {
  return lineItem.source === GOKWIK_COMPLIMENTARY_LINE_SOURCE;
}

export function filterGokwikComplimentaryLineItems(
  lineItems: GokwikLineItemDto[] | undefined | null,
): GokwikLineItemDto[] {
  return (lineItems ?? []).filter(isGokwikComplimentaryLineItem);
}

/** Sanitized line_items snapshot for create/place-order diagnostics. */
export function summarizeGokwikLineItemsForLog(
  lineItems: GokwikLineItemDto[] | undefined | null,
): GokwikLineItemsLogSummary {
  const items = lineItems ?? [];
  const summarized = items.map((lineItem) => {
    const source = lineItem.source?.trim() || null;
    return {
      productId: lineItem.product_id ?? null,
      variantId: lineItem.variant_id ?? null,
      quantity: lineItem.quantity ?? null,
      price: lineItem.price ?? null,
      mrp: lineItem.mrp ?? null,
      discount: lineItem.discount ?? null,
      source,
      title: lineItem.title?.trim() || null,
      discountedItem: lineItem.discounted_item ?? null,
      discountCodes: (lineItem.discounts ?? [])
        .map((discount) => discount.code?.trim())
        .filter((code): code is string => Boolean(code)),
      isComplimentary: isGokwikComplimentaryLineItem({ source: source ?? undefined }),
    };
  });

  return {
    present: lineItems != null,
    totalCount: summarized.length,
    complimentaryCount: summarized.filter((item) => item.isComplimentary).length,
    expectedComplimentarySource: GOKWIK_COMPLIMENTARY_LINE_SOURCE,
    sources: [...new Set(summarized.map((item) => item.source))],
    items: summarized,
  };
}

/** Effective selling price for order storage — complimentary items are always free. */
export function resolveGokwikComplimentaryUnitPrice(
  _gokwikReportedPrice?: number | null,
): number {
  // GoKwik often sends catalog/MRP on freebies (e.g. price=89, discount=89).
  // We never charge for complimentary lines — always persist and fulfill at 0.
  return 0;
}

export function resolveGokwikComplimentaryLineTotal(
  quantity: number,
  gokwikReportedPrice?: number | null,
): number {
  return resolveGokwikComplimentaryUnitPrice(gokwikReportedPrice) * Math.max(1, quantity);
}

export function resolveGokwikComplimentaryMeta(
  lineItem: GokwikLineItemDto,
): GokwikComplimentaryLineItemMeta {
  const couponCode = lineItem.discounts?.find((discount) => discount.code?.trim())?.code?.trim() ?? null;
  return {
    source: GOKWIK_COMPLIMENTARY_LINE_SOURCE,
    couponCode,
    gokwikPrice: toOptionalAmount(lineItem.price),
    gokwikMrp: toOptionalAmount(lineItem.mrp),
  };
}

function toOptionalAmount(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return value;
}
