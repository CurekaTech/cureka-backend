import {
  categoryIdsFromHierarchies,
  diffCategoryIds,
  unionCategoryIds,
} from './product-category-hierarchies.util';

describe('category hierarchy ids for GoKwik collections', () => {
  it('includes every level and a secondary hierarchy, and dedupes ids', () => {
    expect(
      categoryIdsFromHierarchies([
        {
          categoryId: 'c1',
          subCategoryId: 'c2',
          subSubCategoryId: 'c3',
          subSubSubCategoryId: null,
        },
        {
          categoryId: 'c1',
          subCategoryId: 'c4',
          subSubCategoryId: null,
          subSubSubCategoryId: null,
        },
      ]),
    ).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('diffs a primary change and a secondary-only change', () => {
    const previous = [
      { categoryId: 'c1', subCategoryId: 'c2', subSubCategoryId: null, subSubSubCategoryId: null },
    ];
    const next = [
      { categoryId: 'c9', subCategoryId: 'c2', subSubCategoryId: null, subSubSubCategoryId: null },
      { categoryId: 'c5', subCategoryId: null, subSubCategoryId: null, subSubSubCategoryId: null },
    ];

    expect(diffCategoryIds(previous, next)).toEqual(['c1', 'c5', 'c9']);
  });

  it('does not report a category that only moved between hierarchies', () => {
    const previous = [
      { categoryId: 'c1', subCategoryId: 'c2', subSubCategoryId: null, subSubSubCategoryId: null },
      { categoryId: 'c4', subCategoryId: null, subSubCategoryId: null, subSubSubCategoryId: null },
    ];
    const next = [
      { categoryId: 'c1', subCategoryId: null, subSubCategoryId: null, subSubSubCategoryId: null },
      { categoryId: 'c4', subCategoryId: 'c2', subSubCategoryId: null, subSubSubCategoryId: null },
    ];

    expect(diffCategoryIds(previous, next)).toEqual([]);
  });

  it('keeps an id that was added and then removed before approval', () => {
    const original = [
      { categoryId: 'c1', subCategoryId: 'c2', subSubCategoryId: null, subSubSubCategoryId: null },
    ];
    const added = [
      ...original,
      { categoryId: 'c3', subCategoryId: null, subSubCategoryId: null, subSubSubCategoryId: null },
    ];
    const removedAgain = original;

    const afterAdd = unionCategoryIds([], diffCategoryIds(original, added));
    const afterRemove = unionCategoryIds(afterAdd, diffCategoryIds(added, removedAgain));

    expect(afterRemove).toEqual(['c3']);
  });

  it('leaves the pending set unchanged when the hierarchy diff is empty', () => {
    const rows = [
      { categoryId: 'c1', subCategoryId: null, subSubCategoryId: null, subSubSubCategoryId: null },
    ];
    expect(unionCategoryIds(['c1'], diffCategoryIds(rows, rows))).toEqual(['c1']);
  });
});
