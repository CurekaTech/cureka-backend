import 'reflect-metadata';
import { generateProductSlug } from '../../../../modules/product/utils/product-slug.util';
import {
  classifyMinusTwo,
  classifySemanticMinusTwoRestore,
  proposePageUrl,
  stripTrailingMinusTwo,
} from './repair-live-variant-slugs.util';

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

describe('classifyMinusTwo', () => {
  it('does not strip original pack-of-2 URLs that match the product name', () => {
    const name = 'Regaliz Solasafe SPF 50 Sunscreen Gel 50 g Pack of 2';
    const slug = generateProductSlug(name);
    expect(slug.endsWith('-2')).toBe(true);

    expect(
      classifyMinusTwo({
        productName: name,
        productSlug: slug,
        variantSlug: slug,
      }),
    ).toEqual(
      expect.objectContaining({
        repairProduct: false,
        repairVariant: false,
        reason: 'semantic_name_minus_2',
        proposedProductSlug: slug,
        proposedVariantSlug: slug,
      }),
    );
  });

  it('strips variant -2 when it is only a parent-collision suffix', () => {
    expect(
      classifyMinusTwo({
        productName: 'XYZ Face Wash',
        productSlug: 'xyz-face-wash',
        variantSlug: 'xyz-face-wash-2',
      }),
    ).toEqual(
      expect.objectContaining({
        repairProduct: false,
        repairVariant: true,
        proposedProductSlug: 'xyz-face-wash',
        proposedVariantSlug: 'xyz-face-wash',
        reason: 'parent_collision_suffix',
      }),
    );
  });

  it('strips product -2 when the name slug does not include it', () => {
    expect(
      classifyMinusTwo({
        productName: 'XYZ Face Wash',
        productSlug: 'xyz-face-wash-2',
        variantSlug: 'xyz-face-wash-2',
      }),
    ).toEqual(
      expect.objectContaining({
        repairProduct: true,
        repairVariant: true,
        proposedProductSlug: 'xyz-face-wash',
        proposedVariantSlug: 'xyz-face-wash',
        reason: 'uniqueness_suffix_not_in_name',
      }),
    );
  });

  it('strips an extra uniqueness -2 after a semantic pack-of-2 slug', () => {
    const name = 'Regaliz Solasafe SPF 50 Sunscreen Gel 50 g Pack of 2';
    const slug = generateProductSlug(name);
    expect(
      classifyMinusTwo({
        productName: name,
        productSlug: slug,
        variantSlug: `${slug}-2`,
      }),
    ).toEqual(
      expect.objectContaining({
        repairProduct: false,
        repairVariant: true,
        proposedProductSlug: slug,
        proposedVariantSlug: slug,
        reason: 'parent_collision_suffix',
      }),
    );
  });
});

describe('classifySemanticMinusTwoRestore', () => {
  it('restores a pack-of-2 URL that was stripped to the stem', () => {
    const name = 'Regaliz Solasafe SPF 50 Sunscreen Gel 50 g Pack of 2';
    const slug = generateProductSlug(name);
    const stem = stripTrailingMinusTwo(slug);
    expect(stem).toBeTruthy();

    expect(
      classifySemanticMinusTwoRestore({
        productName: name,
        currentProductSlug: stem!,
        currentVariantSlug: stem!,
      }),
    ).toEqual({ restore: true, restoreSlug: slug, restoreVariant: true });
  });

  it('does not restore a correctly cleaned uniqueness suffix', () => {
    expect(
      classifySemanticMinusTwoRestore({
        productName: 'XYZ Face Wash',
        currentProductSlug: 'xyz-face-wash',
        currentVariantSlug: 'xyz-face-wash',
      }),
    ).toEqual(
      expect.objectContaining({ restore: false, restoreSlug: 'xyz-face-wash' }),
    );
  });
});

describe('proposePageUrl', () => {
  it('does not emit a rewrite when the leaf is already the proposed slug', () => {
    expect(
      proposePageUrl(
        '/product/regaliz-solasafe-spf-50-sunscreen-gel-50-g-pack-of-2',
        ['regaliz-solasafe-spf-50-sunscreen-gel-50-g-pack-of-2'],
        'regaliz-solasafe-spf-50-sunscreen-gel-50-g-pack-of-2',
      ),
    ).toBeNull();
  });
});
