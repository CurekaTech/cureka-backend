import { GOKWIK_COMPLIMENTARY_LINE_SOURCE } from '../constants/gokwik-line-item.constants';
import { GokwikLineItemDto } from '../dto/gokwik-line-item.dto';
import {
  filterGokwikComplimentaryLineItems,
  isGokwikComplimentaryLineItem,
  resolveGokwikComplimentaryLineTotal,
  resolveGokwikComplimentaryMeta,
  resolveGokwikComplimentaryUnitPrice,
  summarizeGokwikLineItemsForLog,
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
    expect(resolveGokwikComplimentaryUnitPrice(89)).toBe(0);
    expect(resolveGokwikComplimentaryUnitPrice(null)).toBe(0);
    expect(resolveGokwikComplimentaryLineTotal(1, 89)).toBe(0);
    expect(resolveGokwikComplimentaryLineTotal(3, 89)).toBe(0);
  });

  it('extracts complimentary metadata from discounts', () => {
    expect(resolveGokwikComplimentaryMeta(buildLineItem())).toEqual({
      source: GOKWIK_COMPLIMENTARY_LINE_SOURCE,
      couponCode: 'CARE+3000',
      gokwikPrice: 89,
      gokwikMrp: 89,
    });
  });

  it('summarizes line_items for diagnostic logs', () => {
    const summary = summarizeGokwikLineItemsForLog([
      buildLineItem(),
      buildLineItem({
        source: 'cureka',
        variant_id: '11111111-1111-1111-1111-111111111111',
        discounts: [],
      }),
    ]);

    expect(summary.present).toBe(true);
    expect(summary.totalCount).toBe(2);
    expect(summary.complimentaryCount).toBe(1);
    expect(summary.expectedComplimentarySource).toBe(GOKWIK_COMPLIMENTARY_LINE_SOURCE);
    expect(summary.sources).toEqual(
      expect.arrayContaining([GOKWIK_COMPLIMENTARY_LINE_SOURCE, 'cureka']),
    );
    expect(summary.items[0]).toMatchObject({
      isComplimentary: true,
      discountCodes: ['CARE+3000'],
      source: GOKWIK_COMPLIMENTARY_LINE_SOURCE,
    });
  });

  it('marks missing line_items clearly in summary', () => {
    expect(summarizeGokwikLineItemsForLog(undefined)).toEqual({
      present: false,
      totalCount: 0,
      complimentaryCount: 0,
      expectedComplimentarySource: GOKWIK_COMPLIMENTARY_LINE_SOURCE,
      sources: [],
      items: [],
    });
  });
});
