import { isVariantInStock } from '@packages/common';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { buildProductDocumentId } from '../constants/typesense-document-id.constant';
import { SEARCH_ENTITY_TYPES } from '../constants/search-entity-type.constant';
import { ITypesenseSearchDocument } from '../interfaces/typesense-search-document.interface';

const toNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function getActiveVariants(product: ProductEntity) {
  return (product.variants ?? []).filter(
    (variant) => !variant.deletedAt && variant.status === VariantStatus.ACTIVE,
  );
}

function joinNames(values: Array<string | null | undefined>): string | undefined {
  const names = [...new Set(values.map((value) => value?.trim()).filter(Boolean))] as string[];
  return names.length ? names.join(' ') : undefined;
}

export function mapProductToTypesenseDocument(product: ProductEntity): ITypesenseSearchDocument | null {
  if (product.status !== ProductStatus.PUBLISHED) {
    return null;
  }

  const activeVariants = getActiveVariants(product);
  if (!activeVariants.length) {
    return null;
  }

  const sellingPrices = activeVariants
    .map((variant) => toNumber(variant.sellingPrice))
    .filter((value): value is number => value !== null);

  const healthConcerns = joinNames(
    (product.healthConcernMappings ?? []).map((mapping) => mapping.healthConcern?.name),
  );

  const wellnessGoals = joinNames(
    (product.wellnessGoalMappings ?? []).map((mapping) => mapping.wellnessGoal?.name),
  );

  const tags = joinNames((product.tagMappings ?? []).map((mapping) => mapping.tag?.name));

  const searchTags = joinNames(
    activeVariants.flatMap((variant) => variant.searchTags ?? []),
  );

  return {
    id: buildProductDocumentId(product.refId),
    refId: product.refId,
    entityType: SEARCH_ENTITY_TYPES.PRODUCT,
    name: product.name,
    slug: product.slug,
    brand: product.brand?.name ?? undefined,
    category: product.category?.name ?? undefined,
    subCategory: product.subCategory?.name ?? undefined,
    healthConcerns,
    wellnessGoals,
    tags,
    searchTags,
    description: product.description ?? undefined,
    inStock: activeVariants.some((variant) => isVariantInStock(variant.stock)),
    minSellingPrice: sellingPrices.length ? Math.min(...sellingPrices) : undefined,
  };
}

export function isProductSearchIndexable(product: ProductEntity): boolean {
  return mapProductToTypesenseDocument(product) !== null;
}
