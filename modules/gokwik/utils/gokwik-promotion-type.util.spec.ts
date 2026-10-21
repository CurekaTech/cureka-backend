import { PromotionalPageType } from '@modules/promotional-pages/enums/promotional-page-type.enum';
import { resolveGokwikPromotionType } from './gokwik-promotion-type.util';

describe('resolveGokwikPromotionType', () => {
  it('sends a non-default type from the promotion page', () => {
    expect(resolveGokwikPromotionType([PromotionalPageType.MONTH_END])).toEqual({
      promotionType: PromotionalPageType.MONTH_END,
      conflict: [],
    });
  });

  it('keeps the existing payload for the default promotion type', () => {
    expect(resolveGokwikPromotionType([PromotionalPageType.DEFAULT])).toEqual({
      promotionType: null,
      conflict: [],
    });
  });

  it('keeps the existing payload when the product has no promotion', () => {
    expect(resolveGokwikPromotionType([])).toEqual({
      promotionType: null,
      conflict: [],
    });
  });

  it('uses one type when several pages share that non-default type', () => {
    expect(
      resolveGokwikPromotionType([
        PromotionalPageType.MONTH_END,
        PromotionalPageType.DEFAULT,
        PromotionalPageType.MONTH_END,
      ]),
    ).toEqual({
      promotionType: PromotionalPageType.MONTH_END,
      conflict: [],
    });
  });

  it('does not pick a type when non-default promotion types disagree', () => {
    expect(
      resolveGokwikPromotionType([
        PromotionalPageType.MONTH_END,
        'seasonal' as PromotionalPageType,
      ]),
    ).toEqual({
      promotionType: null,
      conflict: ['month-end', 'seasonal'],
    });
  });
});
