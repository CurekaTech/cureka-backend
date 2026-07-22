import { isVariantInStock } from '@packages/common';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { extractDescriptionFromProductInformation } from '@modules/product/utils/variant-details-payload.util';
import { buildProductDocumentId, buildVariantDocumentId } from '../constants/typesense-document-id.constant';
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

function getVariantAttributeValues(variant: ProductVariantEntity): string[] {
  return (variant.attributeValues ?? [])
    .map((item) => item.value?.trim())
    .filter(Boolean) as string[];
}

function buildVariantSearchTitle(product: ProductEntity, variant: ProductVariantEntity): string {
  const displayName = variant.displayName?.trim();
  if (displayName && displayName.toLowerCase() !== product.name.trim().toLowerCase()) {
    return displayName;
  }

  const attributeLabel = getVariantAttributeValues(variant).join(' / ');
  if (attributeLabel) {
    return `${product.name} ${attributeLabel}`;
  }

  return product.name;
}

function buildVariantDescription(variant: ProductVariantEntity): string | undefined {
  const highlights = variant.productInformation?.find(
    (item) => item.label?.toLowerCase().trim() === 'product highlights',
  )?.description;

  const description =
    variant.description ||
    extractDescriptionFromProductInformation(variant.productInformation ?? []) ||
    undefined;

  return [description, highlights].filter(Boolean).join(' ').trim() || undefined;
}

function mapVariantToTypesenseDocument(
  product: ProductEntity,
  variant: ProductVariantEntity,
  shared: {
    healthConcerns?: string;
    wellnessGoals?: string;
    tags?: string;
    brand?: string;
    category?: string;
    subCategory?: string;
  },
): ITypesenseSearchDocument {
  const attributeValues = getVariantAttributeValues(variant);
  const variantDescription = buildVariantDescription(variant);
  const description = [product.description, variantDescription, attributeValues.join(' ')]
    .filter(Boolean)
    .join(' ')
    .trim();
  const searchTags = joinNames([
    ...(variant.searchTags ?? []),
    ...attributeValues,
    ...(variant.attributeValues ?? []).map((item) => item.attribute?.name),
  ]);
  const sellingPrice = toNumber(variant.sellingPrice);

  return {
    id: buildVariantDocumentId(variant.id),
    refId: product.refId,
    variantId: variant.id,
    variantSlug: variant.slug,
    entityType: SEARCH_ENTITY_TYPES.PRODUCT,
    name: buildVariantSearchTitle(product, variant),
    slug: variant.slug,
    sku: variant.sku?.trim() || undefined,
    brand: shared.brand,
    category: shared.category,
    subCategory: shared.subCategory,
    healthConcerns: shared.healthConcerns,
    wellnessGoals: shared.wellnessGoals,
    tags: shared.tags,
    description: description || undefined,
    inStock: isVariantInStock(variant.stock),
    searchTags,
    minSellingPrice: sellingPrice ?? undefined,
  };
}

export function mapProductToTypesenseDocuments(product: ProductEntity): ITypesenseSearchDocument[] {
  if (product.status !== ProductStatus.PUBLISHED) {
    return [];
  }

  const activeVariants = getActiveVariants(product);
  if (!activeVariants.length) {
    return [];
  }

  const shared = {
    healthConcerns: joinNames(
      (product.healthConcernMappings ?? []).map((mapping) => mapping.healthConcern?.name),
    ),
    wellnessGoals: joinNames(
      (product.wellnessGoalMappings ?? []).map((mapping) => mapping.wellnessGoal?.name),
    ),
    tags: joinNames((product.tagMappings ?? []).map((mapping) => mapping.tag?.name)),
    brand: product.brand?.name ?? undefined,
    category: product.category?.name ?? undefined,
    subCategory: product.subCategory?.name ?? undefined,
  };

  return activeVariants.map((variant) => mapVariantToTypesenseDocument(product, variant, shared));
}

/** @deprecated Prefer mapProductToTypesenseDocuments. */
export function mapProductToTypesenseDocument(product: ProductEntity): ITypesenseSearchDocument | null {
  const documents = mapProductToTypesenseDocuments(product);
  return documents[0] ?? null;
}

export function isProductSearchIndexable(product: ProductEntity): boolean {
  return mapProductToTypesenseDocuments(product).length > 0;
}

export function getProductTypesenseDocumentIds(product: ProductEntity): string[] {
  const activeVariants = getActiveVariants(product);
  const variantIds = activeVariants.map((variant) => buildVariantDocumentId(variant.id));
  return [buildProductDocumentId(product.refId), ...variantIds];
}
