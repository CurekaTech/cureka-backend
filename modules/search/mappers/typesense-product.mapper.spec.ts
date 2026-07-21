import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import {
  isProductSearchIndexable,
  mapProductToTypesenseDocument,
} from './typesense-product.mapper';

describe('typesense-product.mapper', () => {
  const baseProduct = {
    refId: 'SUN20260001',
    name: 'Dolo 650mg',
    slug: 'dolo-650mg',
    status: ProductStatus.PUBLISHED,
    description: 'Pain relief tablet',
    brand: { name: 'Micro Labs' },
    category: { name: 'Pain Relief' },
    variants: [
      {
        deletedAt: null,
        status: VariantStatus.ACTIVE,
        stock: 10,
        sellingPrice: '32.50',
      },
    ],
  } as unknown as ProductEntity;

  it('maps published product with active variant', () => {
    const document = mapProductToTypesenseDocument(baseProduct);

    expect(document).toEqual({
      id: 'SUN20260001',
      refId: 'SUN20260001',
      entityType: 'Product',
      name: 'Dolo 650mg',
      slug: 'dolo-650mg',
      brand: 'Micro Labs',
      category: 'Pain Relief',
      description: 'Pain relief tablet',
      inStock: true,
      minSellingPrice: 32.5,
    });
  });

  it('returns null for draft products', () => {
    const draft = { ...baseProduct, status: ProductStatus.DRAFT } as ProductEntity;
    expect(mapProductToTypesenseDocument(draft)).toBeNull();
    expect(isProductSearchIndexable(draft)).toBe(false);
  });

  it('maps published product with health and wellness metadata', () => {
    const product = {
      ...baseProduct,
      healthConcernMappings: [{ healthConcern: { name: 'Immunity' } }],
      wellnessGoalMappings: [{ wellnessGoal: { name: 'Weight Management' } }],
      tagMappings: [{ tag: { name: 'Vitamin' } }],
      subCategory: { name: 'Pain Relief' },
      variants: [
        {
          deletedAt: null,
          status: VariantStatus.ACTIVE,
          stock: 10,
          sellingPrice: '32.50',
          searchTags: ['paracetamol', 'fever'],
        },
      ],
    } as unknown as ProductEntity;

    const document = mapProductToTypesenseDocument(product);

    expect(document).toMatchObject({
      healthConcerns: 'Immunity',
      wellnessGoals: 'Weight Management',
      tags: 'Vitamin',
      searchTags: 'paracetamol fever',
      subCategory: 'Pain Relief',
    });
  });
});
