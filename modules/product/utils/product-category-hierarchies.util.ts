import { BadRequestException } from '@nestjs/common';
import { CreateProductDto, ProductCategoryHierarchyDto } from '../dto/product.dto';

export interface INormalizedCategoryHierarchyInput {
  categoryRefId: string;
  subCategoryRefId?: string;
  subSubCategoryRefId?: string;
  subSubSubCategoryRefId?: string;
}

/**
 * Prefer `categories[]` when provided; otherwise fall back to the legacy flat fields
 * as a single hierarchy (backward compatible).
 */
export const normalizeCategoryHierarchyInputs = (
  dto: Pick<
    CreateProductDto,
    | 'categories'
    | 'categoryRefId'
    | 'subCategoryRefId'
    | 'subSubCategoryRefId'
    | 'subSubSubCategoryRefId'
  >,
): INormalizedCategoryHierarchyInput[] => {
  if (dto.categories?.length) {
    return dto.categories.map((item) => ({
      categoryRefId: item.categoryRefId,
      subCategoryRefId: item.subCategoryRefId,
      subSubCategoryRefId: item.subSubCategoryRefId,
      subSubSubCategoryRefId: item.subSubSubCategoryRefId,
    }));
  }

  if (!dto.categoryRefId?.trim()) {
    throw new BadRequestException(
      'Provide either categories[] or categoryRefId for the product category hierarchy',
    );
  }

  return [
    {
      categoryRefId: dto.categoryRefId,
      subCategoryRefId: dto.subCategoryRefId,
      subSubCategoryRefId: dto.subSubCategoryRefId,
      subSubSubCategoryRefId: dto.subSubSubCategoryRefId,
    },
  ];
};

export const dtoHasCategoryHierarchyChanges = (
  dto: Pick<
    CreateProductDto,
    | 'categories'
    | 'categoryRefId'
    | 'subCategoryRefId'
    | 'subSubCategoryRefId'
    | 'subSubSubCategoryRefId'
  >,
): boolean =>
  dto.categories !== undefined ||
  dto.categoryRefId !== undefined ||
  dto.subCategoryRefId !== undefined ||
  dto.subSubCategoryRefId !== undefined ||
  dto.subSubSubCategoryRefId !== undefined;

/** Split pipe-separated cells; empty segments are preserved so index alignment can be validated. */
export const splitPipeAlignedValues = (raw: string | undefined | null): string[] => {
  if (raw == null) return [];
  const trimmed = String(raw).trim();
  if (!trimmed) return [];
  return trimmed.split('|').map((part) => part.trim());
};

/**
 * Zip Category / Sub Category / Sub Sub Category / Sub Sub Sub Category columns by index.
 * Throws when non-empty columns have mismatched hierarchy counts.
 */
export const zipBulkCategoryHierarchies = (input: {
  category: string | undefined | null;
  subCategory?: string | undefined | null;
  subSubCategory?: string | undefined | null;
  subSubSubCategory?: string | undefined | null;
}): {
  hierarchies: Array<{
    category: string;
    subCategory?: string;
    subSubCategory?: string;
    subSubSubCategory?: string;
  }>;
  error?: string;
} => {
  const categories = splitPipeAlignedValues(input.category);
  const subCategories = splitPipeAlignedValues(input.subCategory);
  const subSubCategories = splitPipeAlignedValues(input.subSubCategory);
  const subSubSubCategories = splitPipeAlignedValues(input.subSubSubCategory);

  const lengths = [
    { label: 'Category', values: categories },
    { label: 'Sub Category', values: subCategories },
    { label: 'Sub Sub Category', values: subSubCategories },
    { label: 'Sub Sub Sub Category', values: subSubSubCategories },
  ].filter((item) => item.values.length > 0);

  if (!categories.length) {
    return { hierarchies: [] };
  }

  const expectedLength = categories.length;
  for (const item of lengths) {
    if (item.values.length !== expectedLength) {
      return {
        hierarchies: [],
        error: `Category hierarchy lengths do not match. "${item.label}" has ${item.values.length} value(s) but Category has ${expectedLength}. Use the same number of pipe-separated values in Category, Sub Category, Sub Sub Category, and Sub Sub Sub Category (aligned by index).`,
      };
    }
  }

  const hierarchies = categories.map((category, index) => ({
    category,
    subCategory: subCategories[index] || undefined,
    subSubCategory: subSubCategories[index] || undefined,
    subSubSubCategory: subSubSubCategories[index] || undefined,
  }));

  return { hierarchies };
};

export const toCategoryHierarchyDtos = (
  hierarchies: Array<{
    categoryRefId: string;
    subCategoryRefId?: string;
    subSubCategoryRefId?: string;
    subSubSubCategoryRefId?: string;
  }>,
): ProductCategoryHierarchyDto[] =>
  hierarchies.map((item) => ({
    categoryRefId: item.categoryRefId,
    subCategoryRefId: item.subCategoryRefId,
    subSubCategoryRefId: item.subSubCategoryRefId,
    subSubSubCategoryRefId: item.subSubSubCategoryRefId,
  }));

/** SQL fragment: product matches categoryId via primary FKs or any hierarchy row. */
export const PRODUCT_MATCHES_CATEGORY_SQL = `(
  product.category_id = :categoryId
  OR product.sub_category_id = :categoryId
  OR product.sub_sub_category_id = :categoryId
  OR product.sub_sub_sub_category_id = :categoryId
  OR EXISTS (
    SELECT 1 FROM product_category_hierarchies pch
    WHERE pch.product_id = product.id
      AND (
        pch.category_id = :categoryId
        OR pch.sub_category_id = :categoryId
        OR pch.sub_sub_category_id = :categoryId
        OR pch.sub_sub_sub_category_id = :categoryId
      )
  )
)`;

/** TypeORM property-name variant used by entity query builders. */
export const PRODUCT_MATCHES_CATEGORY_ENTITY_SQL = `(
  product.categoryId = :categoryId
  OR product.subCategoryId = :categoryId
  OR product.subSubCategoryId = :categoryId
  OR product.subSubSubCategoryId = :categoryId
  OR EXISTS (
    SELECT 1 FROM product_category_hierarchies pch
    WHERE pch.product_id = product.id
      AND (
        pch.category_id = :categoryId
        OR pch.sub_category_id = :categoryId
        OR pch.sub_sub_category_id = :categoryId
        OR pch.sub_sub_sub_category_id = :categoryId
      )
  )
)`;
