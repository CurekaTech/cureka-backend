import {
  productUrlNeedsSanitization,
  sanitizeProductPagePath,
  sanitizeProductSlugSegment,
} from './sanitize-product-url.util';

describe('sanitize-product-url.util', () => {
  it('replaces literal percent-encoded inch marks with -inches', () => {
    expect(
      sanitizeProductSlugSegment('nebula-high-l-s-support-14%e2%80%b3-d-l-xs'),
    ).toBe('nebula-high-l-s-support-14-inches-d-l-xs');
  });

  it('replaces decoded inch mark with -inches', () => {
    expect(sanitizeProductSlugSegment('nebula-high-l-s-support-14″-d-l-xs')).toBe(
      'nebula-high-l-s-support-14-inches-d-l-xs',
    );
  });

  it('replaces hex leftovers when percent signs were stripped', () => {
    expect(sanitizeProductSlugSegment('nebula-high-l-s-support-14e280b3-d-l-xs')).toBe(
      'nebula-high-l-s-support-14-inches-d-l-xs',
    );
  });

  it('replaces degree marks with -degree', () => {
    expect(
      sanitizeProductSlugSegment(
        'mee-mee-advanced-manual-breast-pump-with-180%cb%9a-rotation-handle-white',
      ),
    ).toBe('mee-mee-advanced-manual-breast-pump-with-180-degree-rotation-handle-white');
  });

  it('sanitizes full shop paths', () => {
    expect(
      sanitizeProductPagePath(
        '/shop/pain-relief/supports-and-splints/nebula-high-l-s-support-14%e2%80%b3-d-l-xs/',
      ),
    ).toBe(
      '/shop/pain-relief/supports-and-splints/nebula-high-l-s-support-14-inches-d-l-xs/',
    );
  });

  it('detects paths that need sanitization', () => {
    expect(
      productUrlNeedsSanitization(
        '/shop/pain-relief/supports-and-splints/nebula-high-l-s-support-14%e2%80%b3-d-l-xs',
      ),
    ).toBe(true);
    expect(
      productUrlNeedsSanitization(
        '/shop/pain-relief/supports-and-splints/nebula-high-l-s-support-14-inches-d-l-xs',
      ),
    ).toBe(false);
  });
});
