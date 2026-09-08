import { normalizeOptionalTrackingIdentifier } from './normalize-optional-tracking-identifier.util';

describe('normalizeOptionalTrackingIdentifier', () => {
  it('omits missing, null, and blank strings', () => {
    expect(normalizeOptionalTrackingIdentifier({ value: undefined })).toBeUndefined();
    expect(normalizeOptionalTrackingIdentifier({ value: null })).toBeUndefined();
    expect(normalizeOptionalTrackingIdentifier({ value: '' })).toBeUndefined();
    expect(normalizeOptionalTrackingIdentifier({ value: '   ' })).toBeUndefined();
  });

  it('preserves string identifiers and leading zeros', () => {
    expect(normalizeOptionalTrackingIdentifier({ value: '11633336773305' })).toBe(
      '11633336773305',
    );
    expect(normalizeOptionalTrackingIdentifier({ value: ' 00123 ' })).toBe('00123');
  });

  it('converts safe integers to decimal strings', () => {
    expect(normalizeOptionalTrackingIdentifier({ value: 11633336773305 })).toBe(
      '11633336773305',
    );
    expect(normalizeOptionalTrackingIdentifier({ value: 0 })).toBe('0');
  });

  it('leaves unsafe or non-integer numbers unchanged for validation to reject', () => {
    expect(normalizeOptionalTrackingIdentifier({ value: Number.MAX_SAFE_INTEGER + 2 })).toBe(
      Number.MAX_SAFE_INTEGER + 2,
    );
    expect(normalizeOptionalTrackingIdentifier({ value: 12.5 })).toBe(12.5);
    expect(normalizeOptionalTrackingIdentifier({ value: Number.NaN })).toBeNaN();
  });

  it('does not stringify unsupported shapes', () => {
    expect(normalizeOptionalTrackingIdentifier({ value: true })).toBe(true);
    expect(normalizeOptionalTrackingIdentifier({ value: ['x'] })).toEqual(['x']);
    expect(normalizeOptionalTrackingIdentifier({ value: { n: 1 } })).toEqual({ n: 1 });
  });
});
