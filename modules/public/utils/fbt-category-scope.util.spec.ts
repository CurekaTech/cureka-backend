import {
  resolveFbtFallbackCategoryId,
  resolveFbtFallbackCategoryIds,
  resolveFbtSourceCategoryName,
} from './fbt-category-scope.util';

describe('fbt-category-scope.util', () => {
  const personalCareRoot = {
    categoryId: 'root-personal-care',
    categoryName: 'Personal Care',
    subCategoryId: 'skin-care',
    subCategoryName: 'Skin Care',
    subSubCategoryId: null,
    subSubCategoryName: null,
    subSubSubCategoryId: null,
    subSubSubCategoryName: null,
  };

  it('uses deepest category name for FBT rule source matching', () => {
    expect(resolveFbtSourceCategoryName(personalCareRoot)).toBe('skin care');
    expect(
      resolveFbtSourceCategoryName({
        ...personalCareRoot,
        subSubCategoryName: 'Face Moisturizer',
        subSubCategoryId: 'face-moisturizer',
      }),
    ).toBe('face moisturizer');
  });

  it('uses sub-category id for fallback scope instead of root category', () => {
    expect(resolveFbtFallbackCategoryId(personalCareRoot)).toBe('skin-care');
    expect(resolveFbtFallbackCategoryId(personalCareRoot)).not.toBe('root-personal-care');
  });

  it('deduplicates fallback category ids across seed variants', () => {
    const babyCareVariant = {
      categoryId: 'root-personal-care',
      categoryName: 'Personal Care',
      subCategoryId: 'baby-care',
      subCategoryName: 'Baby Care',
    };

    expect(
      resolveFbtFallbackCategoryIds([personalCareRoot, babyCareVariant]),
    ).toEqual(['skin-care', 'baby-care']);
  });
});
