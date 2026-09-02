import { GOKWIK_COMPLIMENTARY_LINE_SOURCE } from '../constants/gokwik-line-item.constants';
import { GokwikLineItemDto } from '../dto/gokwik-line-item.dto';
import {
  filterGokwikComplimentaryLineItems,
  isGokwikComplimentaryLineItem,
  resolveGokwikComplimentaryLineTotal,
  resolveGokwikComplimentaryMeta,
  resolveGokwikComplimentaryUnitPrice,
} from './gokwik-line-item.util';

function buildLineItem(overrides: Partial<GokwikLineItemDto> = {}): GokwikLineItemDto {
  return {
    product_id: 'dc372bee-0a20-4166-9d1c-46e8055a2f4e',
    variant_id: '6ce5adad-264d-4f6c-8623-e9ee675d1492',
    quantity: 1,
    price: 89,
    mrp: 89,
    discount: 89,
    source: GOKWIK_COMPLIMENTARY_LINE_SOURCE,
    title: 'diclojat-pain-relief-gel',
    discounted_item: true,
    discounts: [{ amount: 89, code: 'CARE+3000', type: 'gkp-internal-coupon' }],
    ...overrides,
  };
}

describe('gokwik-line-item.util', () => {
  it('detects complimentary items by source', () => {
    expect(isGokwikComplimentaryLineItem(buildLineItem())).toBe(true);
    expect(isGokwikComplimentaryLineItem(buildLineItem({ source: 'cureka' }))).toBe(false);
    expect(isGokwikComplimentaryLineItem(buildLineItem({ source: undefined }))).toBe(false);
  });

  it('filters only complimentary line items', () => {
    const items = [
      buildLineItem(),
      buildLineItem({ source: 'cureka', variant_id: '11111111-1111-1111-1111-111111111111' }),
    ];
    expect(filterGokwikComplimentaryLineItems(items)).toHaveLength(1);
    expect(filterGokwikComplimentaryLineItems([])).toEqual([]);
    expect(filterGokwikComplimentaryLineItems(null)).toEqual([]);
  });

  it('forces complimentary effective prices to zero regardless of GoKwik price', () => {
    expect(resolveGokwikComplimentaryUnitPrice()).toBe(0);
    expect(resolveGokwikComplimentaryLineTotal(1)).toBe(0);
    expect(resolveGokwikComplimentaryLineTotal(3)).toBe(0);
  });

  it('extracts complimentary metadata from discounts', () => {
    expect(resolveGokwikComplimentaryMeta(buildLineItem())).toEqual({
      source: GOKWIK_COMPLIMENTARY_LINE_SOURCE,
      couponCode: 'CARE+3000',
      gokwikPrice: 89,
      gokwikMrp: 89,
    });
  });
});
