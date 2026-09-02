import { GOKWIK_COMPLIMENTARY_LINE_SOURCE } from '../constants/gokwik-line-item.constants';
import { GokwikLineItemDto } from '../dto/gokwik-line-item.dto';

export type GokwikComplimentaryLineItemMeta = {
  source: typeof GOKWIK_COMPLIMENTARY_LINE_SOURCE;
  couponCode: string | null;
  gokwikPrice: number | null;
  gokwikMrp: number | null;
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

/** Effective selling price for order storage — complimentary items are always free. */
export function resolveGokwikComplimentaryUnitPrice(): number {
  return 0;
}

export function resolveGokwikComplimentaryLineTotal(quantity: number): number {
  return resolveGokwikComplimentaryUnitPrice() * Math.max(1, quantity);
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
