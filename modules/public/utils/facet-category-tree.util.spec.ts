import { CategoryHierarchyLevel } from '@modules/master/enums/category-hierarchy-level.enum';
import { buildFacetCategoryForest, paginateFacetCategoryRoots } from './facet-category-tree.util';

const hairCare = {
  id: 'cat-hair',
  refId: 'CAT1',
  name: 'Hair Care',
  slug: 'hair-care',
  position: 1,
  hierarchyLevel: CategoryHierarchyLevel.ROOT,
  parentCategoryId: null,
};

const shampoo = {
  id: 'cat-shampoo',
  refId: 'CAT2',
  name: 'Shampoo',
  slug: 'shampoo',
  position: 1,
  hierarchyLevel: CategoryHierarchyLevel.CHILD,
  parentCategoryId: 'cat-hair',
};

const skinCare = {
  id: 'cat-skin',
  refId: 'CAT3',
  name: 'Skin Care',
  slug: 'skin-care',
  position: 2,
  hierarchyLevel: CategoryHierarchyLevel.ROOT,
  parentCategoryId: null,
};

describe('buildFacetCategoryForest', () => {
  it('nests matching children under applicable parents', () => {
    const forest = buildFacetCategoryForest(
      [hairCare, shampoo, skinCare],
      new Map([
        ['cat-hair', 10],
        ['cat-shampoo', 4],
      ]),
    );

    expect(forest).toHaveLength(1);
    expect(forest[0].slug).toBe('hair-care');
    expect(forest[0].children).toHaveLength(1);
    expect(forest[0].children[0].slug).toBe('shampoo');
    expect(forest[0].children[0].slugPath).toEqual(['hair-care', 'shampoo']);
    expect(forest[0].children[0].permalink).toBe('/product-category/hair-care/shampoo');
  });

  it('roots the tree at the locked category and keeps children', () => {
    const forest = buildFacetCategoryForest(
      [hairCare, shampoo, skinCare],
      new Map([
        ['cat-hair', 10],
        ['cat-shampoo', 4],
        ['cat-skin', 8],
      ]),
      { lockedCategoryId: 'cat-hair' },
    );

    expect(forest).toHaveLength(1);
    expect(forest[0].slug).toBe('hair-care');
    expect(forest[0].children.map((child) => child.slug)).toEqual(['shampoo']);
  });

  it('keeps an ancestor so a matching child can nest', () => {
    const forest = buildFacetCategoryForest(
      [hairCare, shampoo],
      new Map([['cat-shampoo', 3]]),
    );

    expect(forest).toHaveLength(1);
    expect(forest[0].slug).toBe('hair-care');
    expect(forest[0].productCount).toBe(0);
    expect(forest[0].children[0].productCount).toBe(3);
  });

  it('paginates roots only', () => {
    const forest = buildFacetCategoryForest(
      [hairCare, skinCare],
      new Map([
        ['cat-hair', 1],
        ['cat-skin', 1],
      ]),
    );
    const page1 = paginateFacetCategoryRoots(forest, 1);
    expect(page1.items).toHaveLength(1);
    expect(page1.hasMore).toBe(true);
    const page2 = paginateFacetCategoryRoots(forest, 1, page1.items[0].id);
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0].slug).toBe('skin-care');
    expect(page2.hasMore).toBe(false);
  });
});
