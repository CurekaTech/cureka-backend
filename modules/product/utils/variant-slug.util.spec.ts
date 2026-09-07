import 'reflect-metadata';
import { buildVariantSlug, buildVariantSlugCandidates } from './variant-slug.util';

describe('variant-slug.util', () => {
  it('uses the product name slug and does not append SKU', () => {
    expect(buildVariantSlug('xyz-face-wash', { attributeValues: [] })).toBe('xyz-face-wash');
  });

  it('prefers an explicit custom slug', () => {
    expect(
      buildVariantSlug('xyz-face-wash', {
        slug: 'My Custom URL',
        attributeValues: ['50ml'],
      }),
    ).toBe('my-custom-url');
  });

  it('lists name first, then attribute suffix for uniqueness', () => {
    expect(
      buildVariantSlugCandidates('xyz-face-wash', {
        attributeValues: ['50ml'],
      }),
    ).toEqual(['xyz-face-wash', 'xyz-face-wash-50ml']);
  });

  it('lists clothing size only as a uniqueness suffix', () => {
    expect(
      buildVariantSlugCandidates('cotton-t-shirt', {
        attributeValues: ['XXL'],
      }),
    ).toEqual(['cotton-t-shirt', 'cotton-t-shirt-xxl']);
  });
});
