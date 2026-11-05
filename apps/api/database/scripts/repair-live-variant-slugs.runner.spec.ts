import { stripTrailingMinusTwo } from './repair-live-variant-slugs.runner';

describe('stripTrailingMinusTwo', () => {
  it('strips a uniqueness suffix -2', () => {
    expect(
      stripTrailingMinusTwo(
        'pure-nutrition-omega-3-5-6-7-9-1630-mg-30-softgels-2',
      ),
    ).toBe('pure-nutrition-omega-3-5-6-7-9-1630-mg-30-softgels');
  });

  it('does not strip -12 or a slug that already is clean', () => {
    expect(stripTrailingMinusTwo('pack-12')).toBeNull();
    expect(stripTrailingMinusTwo('pure-nutrition-omega-3-5-6-7-9-1630-mg-30-softgels')).toBeNull();
  });
});
