import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import {
  getProductTypesenseDocumentIds,
  isProductSearchIndexable,
  mapProductToTypesenseDocument,
  mapProductToTypesenseDocuments,
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
        id: 'variant-1',
        slug: 'dolo-650mg',
        sku: 'DOLO-650',
        deletedAt: null,
        status: VariantStatus.ACTIVE,
        stock: 10,
        sellingPrice: '32.50',
        attributeValues: [],
      },
    ],
  } as unknown as ProductEntity;

  it('maps published product with active variant', () => {
    const documents = mapProductToTypesenseDocuments(baseProduct);

    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      id: 'variant:variant-1',
      refId: 'SUN20260001',
      variantId: 'variant-1',
      variantSlug: 'dolo-650mg',
      entityType: 'Product',
      name: 'Dolo 650mg',
      slug: 'dolo-650mg',
      sku: 'DOLO-650',
      brand: 'Micro Labs',
      category: 'Pain Relief',
      description: 'Pain relief tablet',
      inStock: true,
      minSellingPrice: 32.5,
    });
  });

  it('maps each active variant to its own searchable document', () => {
    const product = {
      ...baseProduct,
      name: 'Cureka Vertical Variant Test',
      slug: 'cureka-vertical-variant-test',
      variants: [
        {
          id: 'variant-small',
          slug: 'cureka-vertical-variant-test-small',
          deletedAt: null,
          status: VariantStatus.ACTIVE,
          stock: 5,
          sellingPrice: '100',
          attributeValues: [{ value: 'Small', attribute: { name: 'Size' } }],
        },
        {
          id: 'variant-medium',
          slug: 'cureka-vertical-variant-test-medium',
          deletedAt: null,
          status: VariantStatus.ACTIVE,
          stock: 5,
          sellingPrice: '110',
          attributeValues: [{ value: 'Medium', attribute: { name: 'Size' } }],
        },
        {
          id: 'variant-large',
          slug: 'cureka-vertical-variant-test-large',
          deletedAt: null,
          status: VariantStatus.ACTIVE,
          stock: 5,
          sellingPrice: '120',
          attributeValues: [{ value: 'Large', attribute: { name: 'Size' } }],
        },
      ],
    } as unknown as ProductEntity;

    const documents = mapProductToTypesenseDocuments(product);

    expect(documents).toHaveLength(3);
    expect(documents.map((document) => document.name)).toEqual([
      'Cureka Vertical Variant Test Small',
      'Cureka Vertical Variant Test Medium',
      'Cureka Vertical Variant Test Large',
    ]);
    expect(documents.map((document) => document.searchTags)).toEqual([
      'Small Size',
      'Medium Size',
      'Large Size',
    ]);
    expect(getProductTypesenseDocumentIds(product)).toEqual([
      'SUN20260001',
      'variant:variant-small',
      'variant:variant-medium',
      'variant:variant-large',
    ]);
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
          id: 'variant-1',
          slug: 'dolo-650mg',
          deletedAt: null,
          status: VariantStatus.ACTIVE,
          stock: 10,
          sellingPrice: '32.50',
          searchTags: ['paracetamol', 'fever'],
          attributeValues: [],
        },
      ],
    } as unknown as ProductEntity;

    const document = mapProductToTypesenseDocuments(product)[0];

    expect(document).toMatchObject({
      healthConcerns: 'Immunity',
      wellnessGoals: 'Weight Management',
      tags: 'Vitamin',
      searchTags: 'paracetamol fever',
      subCategory: 'Pain Relief',
    });
  });
});
