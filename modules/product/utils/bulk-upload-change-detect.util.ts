import { UpdateProductDto } from '../dto/product.dto';
import { CreateVariantDto } from '../dto/variant.dto';
import { ProductEntity } from '../entities/product.entity';
import { ProductVariantEntity } from '../entities/product-variant.entity';
import {
  mergeProductInformationByLabel,
  productInformationEquals,
} from './product-information.util';
import { normalizeSkuMatchKey } from './sku-match.util';

const normText = (value: string | null | undefined): string => (value ?? '').trim();

const normMoney = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(num) ? num.toFixed(2) : '';
};

const normBool = (value: boolean | null | undefined): boolean | undefined =>
  value === undefined || value === null ? undefined : Boolean(value);

const sameText = (left: string | null | undefined, right: string | null | undefined): boolean =>
  normText(left) === normText(right);

const sameMoney = (
  left: string | number | null | undefined,
  right: string | number | null | undefined,
): boolean => normMoney(left) === normMoney(right);

const sameNumber = (
  left: number | null | undefined,
  right: number | null | undefined,
): boolean => {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return Number(left) === Number(right);
};

const sameStringArray = (
  left: string[] | null | undefined,
  right: string[] | null | undefined,
): boolean => {
  const a = [...(left ?? [])].map((item) => item.trim().toLowerCase()).filter(Boolean).sort();
  const b = [...(right ?? [])].map((item) => item.trim().toLowerCase()).filter(Boolean).sort();
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
};

const sameRefIdSet = (
  left: string[] | null | undefined,
  right: string[] | null | undefined,
): boolean => {
  const a = new Set((left ?? []).map((item) => item.trim()).filter(Boolean));
  const b = new Set((right ?? []).map((item) => item.trim()).filter(Boolean));
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
};

const categoryFiltersEqual = (
  existing: ProductEntity['categoryFilterMappings'],
  incoming: UpdateProductDto['categoryFilters'],
): boolean => {
  if (incoming === undefined) return true;
  const existingGrouped = new Map<string, Set<string>>();
  for (const mapping of existing ?? []) {
    const refId = mapping.categoryFilter?.refId?.trim();
    if (!refId) continue;
    const set = existingGrouped.get(refId) ?? new Set<string>();
    if (mapping.value?.trim()) set.add(mapping.value.trim().toLowerCase());
    existingGrouped.set(refId, set);
  }

  const incomingGrouped = new Map<string, Set<string>>();
  for (const item of incoming ?? []) {
    const refId = item.categoryFilterRefId?.trim();
    if (!refId) continue;
    const set = incomingGrouped.get(refId) ?? new Set<string>();
    for (const value of item.values ?? []) {
      if (value?.trim()) set.add(value.trim().toLowerCase());
    }
    incomingGrouped.set(refId, set);
  }

  if (existingGrouped.size !== incomingGrouped.size) return false;
  for (const [refId, values] of existingGrouped) {
    const other = incomingGrouped.get(refId);
    if (!other || other.size !== values.size) return false;
    for (const value of values) {
      if (!other.has(value)) return false;
    }
  }
  return true;
};

const variantAttributesEqual = (
  existing: ProductVariantEntity,
  incoming: CreateVariantDto['attributes'],
): boolean => {
  if (incoming === undefined) return true;
  const existingPairs = (existing.attributeValues ?? [])
    .map((item) => ({
      refId: item.attribute?.refId?.trim() ?? '',
      value: (item.value ?? '').trim().toLowerCase(),
    }))
    .filter((item) => item.refId)
    .sort((a, b) => a.refId.localeCompare(b.refId) || a.value.localeCompare(b.value));
  const incomingPairs = (incoming ?? [])
    .map((item) => ({
      refId: item.attributeRefId?.trim() ?? '',
      value: (item.value ?? '').trim().toLowerCase(),
    }))
    .filter((item) => item.refId)
    .sort((a, b) => a.refId.localeCompare(b.refId) || a.value.localeCompare(b.value));
  if (existingPairs.length !== incomingPairs.length) return false;
  return existingPairs.every(
    (item, index) =>
      item.refId === incomingPairs[index]?.refId && item.value === incomingPairs[index]?.value,
  );
};

const buildSparseVariantPatch = (
  existing: ProductVariantEntity,
  incoming: CreateVariantDto,
): CreateVariantDto | null => {
  // Sparse patch: required CreateVariantDto fields are filled only when changed.
  const patch = { sku: existing.sku } as CreateVariantDto;
  let changed = false;

  const assignIfChanged = <K extends keyof CreateVariantDto>(
    key: K,
    next: CreateVariantDto[K] | undefined,
    equal: boolean,
  ) => {
    if (next === undefined) return;
    if (equal) return;
    patch[key] = next;
    changed = true;
  };

  assignIfChanged('mrp', incoming.mrp, sameMoney(existing.mrp, incoming.mrp));
  assignIfChanged(
    'sellingPrice',
    incoming.sellingPrice,
    sameMoney(existing.sellingPrice, incoming.sellingPrice),
  );
  assignIfChanged(
    'discountPercentage',
    incoming.discountPercentage,
    sameMoney(existing.discountPercentage, incoming.discountPercentage),
  );
  assignIfChanged('stock', incoming.stock, sameNumber(existing.stock, incoming.stock));
  assignIfChanged(
    'outOfStock',
    incoming.outOfStock,
    normBool(existing.outOfStock) === normBool(incoming.outOfStock),
  );
  assignIfChanged(
    'inCurekaInventory',
    incoming.inCurekaInventory,
    normBool(existing.inCurekaInventory) === normBool(incoming.inCurekaInventory),
  );
  assignIfChanged('barcode', incoming.barcode, sameText(existing.barcode, incoming.barcode));
  assignIfChanged(
    'gtinNumber',
    incoming.gtinNumber,
    sameText(existing.gtinNumber, incoming.gtinNumber),
  );
  assignIfChanged('hsnCode', incoming.hsnCode, sameText(existing.hsnCode, incoming.hsnCode));
  assignIfChanged(
    'batchNumber',
    incoming.batchNumber,
    sameText(existing.batchNumber, incoming.batchNumber),
  );
  assignIfChanged(
    'expiryDate',
    incoming.expiryDate,
    sameText(existing.expiryDate, incoming.expiryDate),
  );
  assignIfChanged('taxClass', incoming.taxClass, sameText(existing.taxClass, incoming.taxClass));
  assignIfChanged('status', incoming.status, sameText(existing.status, incoming.status));
  assignIfChanged('slug', incoming.slug, sameText(existing.slug, incoming.slug));
  assignIfChanged(
    'productPageUrl',
    incoming.productPageUrl,
    sameText(existing.productPageUrl, incoming.productPageUrl),
  );
  assignIfChanged(
    'externalProductId',
    incoming.externalProductId,
    sameText(existing.externalProductId, incoming.externalProductId),
  );
  assignIfChanged('weight', incoming.weight, sameNumber(existing.weight as any, incoming.weight));
  assignIfChanged(
    'weightUnit',
    incoming.weightUnit,
    sameText(existing.weightUnit, incoming.weightUnit),
  );
  assignIfChanged('length', incoming.length, sameNumber(existing.length as any, incoming.length));
  assignIfChanged('width', incoming.width, sameNumber(existing.width as any, incoming.width));
  assignIfChanged('height', incoming.height, sameNumber(existing.height as any, incoming.height));
  assignIfChanged(
    'estimatedDeliveryTime',
    incoming.estimatedDeliveryTime,
    sameText(existing.estimatedDeliveryTime, incoming.estimatedDeliveryTime),
  );
  assignIfChanged(
    'searchTags',
    incoming.searchTags,
    sameStringArray(existing.searchTags, incoming.searchTags),
  );

  if (incoming.productInformation !== undefined) {
    const merged = mergeProductInformationByLabel(
      existing.productInformation,
      incoming.productInformation,
    );
    if (!productInformationEquals(existing.productInformation, merged)) {
      patch.productInformation = merged;
      changed = true;
    }
  }

  if (incoming.attributes !== undefined && !variantAttributesEqual(existing, incoming.attributes)) {
    patch.attributes = incoming.attributes;
    changed = true;
  }

  if (incoming.images !== undefined) {
    patch.images = incoming.images;
    changed = true;
  }

  return changed ? patch : null;
};

export type BulkUploadChangeDetectResult =
  | { skip: true }
  | {
      skip: false;
      sparseDto: UpdateProductDto;
      /** When true, variants should use preserve-missing + sparse patch path. */
      hasVariantPatches: boolean;
    };

/**
 * Build a sparse update payload from a full bulk DTO vs the existing product.
 * Unchanged fields / relations are omitted. Blank/undefined incoming values are ignored.
 */
export const detectBulkUploadChanges = (
  existing: ProductEntity,
  incoming: UpdateProductDto,
): BulkUploadChangeDetectResult => {
  const sparse: UpdateProductDto = {};
  let changed = false;

  const setIfChanged = <K extends keyof UpdateProductDto>(
    key: K,
    next: UpdateProductDto[K] | undefined,
    equal: boolean,
  ) => {
    if (next === undefined) return;
    if (equal) return;
    sparse[key] = next;
    changed = true;
  };

  setIfChanged('name', incoming.name, sameText(existing.name, incoming.name));
  setIfChanged(
    'productType',
    incoming.productType,
    sameText(existing.productType, incoming.productType),
  );
  setIfChanged(
    'description',
    incoming.description,
    sameText(existing.description, incoming.description),
  );
  setIfChanged('slug', incoming.slug, sameText(existing.slug, incoming.slug));
  setIfChanged(
    'externalProductId',
    incoming.externalProductId,
    sameText(existing.externalProductId, incoming.externalProductId),
  );
  setIfChanged(
    'singleProductUrl',
    incoming.singleProductUrl,
    sameText(existing.singleProductUrl, incoming.singleProductUrl),
  );
  setIfChanged(
    'subscriptionEnabled',
    incoming.subscriptionEnabled,
    normBool(existing.subscriptionEnabled) === normBool(incoming.subscriptionEnabled),
  );
  setIfChanged(
    'returnAllowed',
    incoming.returnAllowed,
    normBool(existing.returnAllowed) === normBool(incoming.returnAllowed),
  );
  setIfChanged(
    'returnPolicy',
    incoming.returnPolicy,
    sameText(existing.returnPolicy, incoming.returnPolicy),
  );
  setIfChanged(
    'returnWindowDays',
    incoming.returnWindowDays,
    sameNumber(existing.returnWindowDays, incoming.returnWindowDays),
  );
  setIfChanged(
    'codAvailable',
    incoming.codAvailable,
    normBool(existing.codAvailable) === normBool(incoming.codAvailable),
  );
  setIfChanged(
    'emiAvailable',
    incoming.emiAvailable,
    normBool(existing.emiAvailable) === normBool(incoming.emiAvailable),
  );
  setIfChanged(
    'replaceAllowed',
    incoming.replaceAllowed,
    normBool(existing.replaceAllowed) === normBool(incoming.replaceAllowed),
  );
  setIfChanged(
    'replaceWindowDays',
    incoming.replaceWindowDays,
    sameNumber(existing.replaceWindowDays, incoming.replaceWindowDays),
  );
  setIfChanged('metaTitle', incoming.metaTitle, sameText(existing.metaTitle, incoming.metaTitle));
  setIfChanged(
    'metaDescription',
    incoming.metaDescription,
    sameText(existing.metaDescription, incoming.metaDescription),
  );
  setIfChanged(
    'metaKeywords',
    incoming.metaKeywords,
    sameStringArray(existing.metaKeywords, incoming.metaKeywords),
  );
  setIfChanged(
    'manufacturerAddress',
    incoming.manufacturerAddress,
    sameText(existing.manufacturerAddress, incoming.manufacturerAddress),
  );
  setIfChanged(
    'packerAddress',
    incoming.packerAddress,
    sameText(existing.packerAddress, incoming.packerAddress),
  );
  setIfChanged(
    'importerAddress',
    incoming.importerAddress,
    sameText(existing.importerAddress, incoming.importerAddress),
  );
  setIfChanged(
    'components',
    incoming.components,
    sameText(existing.components, incoming.components),
  );
  setIfChanged(
    'expiresInMonths',
    incoming.expiresInMonths,
    sameNumber(existing.expiresInMonths, incoming.expiresInMonths),
  );

  setIfChanged(
    'brandRefId',
    incoming.brandRefId,
    sameText(existing.brand?.refId, incoming.brandRefId),
  );
  setIfChanged(
    'categoryRefId',
    incoming.categoryRefId,
    sameText(existing.category?.refId, incoming.categoryRefId),
  );
  setIfChanged(
    'subCategoryRefId',
    incoming.subCategoryRefId,
    sameText(existing.subCategory?.refId, incoming.subCategoryRefId),
  );
  setIfChanged(
    'subSubCategoryRefId',
    incoming.subSubCategoryRefId,
    sameText(existing.subSubCategory?.refId, incoming.subSubCategoryRefId),
  );
  setIfChanged(
    'subSubSubCategoryRefId',
    incoming.subSubSubCategoryRefId,
    sameText(existing.subSubSubCategory?.refId, incoming.subSubSubCategoryRefId),
  );
  setIfChanged(
    'manufacturerRefId',
    incoming.manufacturerRefId,
    sameText(existing.manufacturer?.refId, incoming.manufacturerRefId),
  );
  setIfChanged(
    'packerRefId',
    incoming.packerRefId,
    sameText(existing.packer?.refId, incoming.packerRefId),
  );
  setIfChanged(
    'importerRefId',
    incoming.importerRefId,
    sameText(existing.importer?.refId, incoming.importerRefId),
  );
  setIfChanged(
    'countryOfOriginRefId',
    incoming.countryOfOriginRefId,
    sameText(existing.countryOfOrigin?.refId, incoming.countryOfOriginRefId),
  );
  setIfChanged(
    'productNatureRefId',
    incoming.productNatureRefId,
    sameText(existing.productNature?.refId, incoming.productNatureRefId),
  );

  if (incoming.healthConcernRefIds !== undefined) {
    const existingIds =
      existing.healthConcernMappings?.map((item) => item.healthConcern?.refId).filter(Boolean) ??
      [];
    if (!sameRefIdSet(existingIds as string[], incoming.healthConcernRefIds)) {
      sparse.healthConcernRefIds = incoming.healthConcernRefIds;
      changed = true;
    }
  }

  if (incoming.wellnessGoalRefIds !== undefined) {
    const existingIds =
      existing.wellnessGoalMappings?.map((item) => item.wellnessGoal?.refId).filter(Boolean) ?? [];
    if (!sameRefIdSet(existingIds as string[], incoming.wellnessGoalRefIds)) {
      sparse.wellnessGoalRefIds = incoming.wellnessGoalRefIds;
      changed = true;
    }
  }

  if (incoming.tagNames !== undefined) {
    const existingNames =
      existing.tagMappings?.map((item) => item.tag?.name).filter(Boolean) ?? [];
    if (!sameStringArray(existingNames as string[], incoming.tagNames)) {
      sparse.tagNames = incoming.tagNames;
      changed = true;
    }
  }

  // Dynamic family 1: product information (merge-by-label).
  if (incoming.productInformation !== undefined) {
    const merged = mergeProductInformationByLabel(
      existing.productInformation,
      incoming.productInformation,
    );
    if (!productInformationEquals(existing.productInformation, merged)) {
      sparse.productInformation = merged;
      changed = true;
    }
  }

  // Dynamic family 2: CF_* category filters.
  if (incoming.categoryFilters !== undefined) {
    if (!categoryFiltersEqual(existing.categoryFilterMappings, incoming.categoryFilters)) {
      sparse.categoryFilters = incoming.categoryFilters;
      changed = true;
    }
  }

  if (incoming.customFaqs !== undefined) {
    const existingFaqs =
      existing.faqMappings
        ?.map((mapping) => ({
          question: mapping.productFaq?.question?.trim() ?? '',
          answer: mapping.productFaq?.answer?.trim() ?? '',
        }))
        .filter((faq) => faq.question && faq.answer) ?? [];
    const incomingFaqs = (incoming.customFaqs ?? []).map((faq) => ({
      question: faq.question?.trim() ?? '',
      answer: faq.answer?.trim() ?? '',
    }));
    const faqsEqual =
      existingFaqs.length === incomingFaqs.length &&
      existingFaqs.every(
        (faq, index) =>
          faq.question === incomingFaqs[index]?.question &&
          faq.answer === incomingFaqs[index]?.answer,
      );
    if (!faqsEqual) {
      sparse.customFaqs = incoming.customFaqs;
      changed = true;
    }
  }

  if (incoming.media !== undefined) {
    // Media only included on the DTO when the sheet intentionally resolved images.
    sparse.media = incoming.media;
    changed = true;
  }

  if (incoming.packMetadata !== undefined) {
    const existingPacks = JSON.stringify(existing.packMetadata ?? []);
    const incomingPacks = JSON.stringify(incoming.packMetadata ?? []);
    if (existingPacks !== incomingPacks) {
      sparse.packMetadata = incoming.packMetadata;
      changed = true;
    }
  }

  if (incoming.categories !== undefined) {
    const existingHierarchies = (existing.categoryHierarchies ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((row) =>
        [
          row.category?.refId ?? '',
          row.subCategory?.refId ?? '',
          row.subSubCategory?.refId ?? '',
          row.subSubSubCategory?.refId ?? '',
        ].join('|'),
      );
    const incomingHierarchies = (incoming.categories ?? []).map((row) =>
      [
        row.categoryRefId ?? '',
        row.subCategoryRefId ?? '',
        row.subSubCategoryRefId ?? '',
        row.subSubSubCategoryRefId ?? '',
      ].join('|'),
    );
    const hierarchiesDiffer =
      existingHierarchies.length !== incomingHierarchies.length ||
      existingHierarchies.some((value, index) => value !== incomingHierarchies[index]);
    const flatDiffer =
      !existingHierarchies.length &&
      (!sameText(existing.category?.refId, incoming.categoryRefId) ||
        !sameText(existing.subCategory?.refId, incoming.subCategoryRefId) ||
        !sameText(existing.subSubCategory?.refId, incoming.subSubCategoryRefId) ||
        !sameText(existing.subSubSubCategory?.refId, incoming.subSubSubCategoryRefId));
    if (hierarchiesDiffer || flatDiffer) {
      sparse.categories = incoming.categories;
      changed = true;
    }
  }

  if (incoming.bundleItems !== undefined) {
    const existingItems = (existing.bundleItems ?? [])
      .map((item) => {
        const childSku =
          item.childVariant?.sku ??
          existing.variants?.find((variant) => variant.id === item.childVariantId)?.sku ??
          '';
        return `${normalizeSkuMatchKey(childSku)}|${item.quantity}`;
      })
      .sort();
    const incomingItems = (incoming.bundleItems ?? [])
      .map((item) => `${normalizeSkuMatchKey(item.childVariantSku ?? '')}|${item.quantity}`)
      .sort();
    const bundlesEqual =
      existingItems.length === incomingItems.length &&
      existingItems.every((value, index) => value === incomingItems[index]);
    if (!bundlesEqual) {
      sparse.bundleItems = incoming.bundleItems;
      changed = true;
    }
  }

  if (incoming.attributeRefIds !== undefined) {
    const existingIds =
      existing.attributeMappings?.map((item) => item.attribute?.refId).filter(Boolean) ?? [];
    if (!sameRefIdSet(existingIds as string[], incoming.attributeRefIds)) {
      sparse.attributeRefIds = incoming.attributeRefIds;
      changed = true;
    }
  }

  // Dynamic family 3 + variant scalars.
  const existingBySku = new Map(
    (existing.variants ?? []).map((variant) => [
      normalizeSkuMatchKey(variant.sku),
      variant,
    ] as const),
  );
  const variantPatches: CreateVariantDto[] = [];
  for (const incomingVariant of incoming.variants ?? []) {
    const matched = existingBySku.get(normalizeSkuMatchKey(incomingVariant.sku));
    if (!matched) {
      // New SKU on an existing product — include full incoming variant.
      variantPatches.push(incomingVariant);
      changed = true;
      continue;
    }
    const patch = buildSparseVariantPatch(matched, incomingVariant);
    if (patch) {
      variantPatches.push(patch);
      changed = true;
    }
  }

  if (variantPatches.length) {
    sparse.variants = variantPatches;
  }

  if (!changed) {
    return { skip: true };
  }

  return {
    skip: false,
    sparseDto: sparse,
    hasVariantPatches: variantPatches.length > 0,
  };
};
