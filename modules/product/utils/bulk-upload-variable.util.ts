import {
  buildVariantCombinationKey,
  findDuplicateCombinationKeys,
  IVariantAttributeInput,
} from './variant-combination-key.util';
import { BULK_UPLOAD_VARIANT_IMAGE_COUNT } from './bulk-upload-image.util';

export const MAX_GENERATED_VARIANTS = 100;
export const VARIABLE_TEMPLATE_ATTRIBUTE_COUNT = 5;
export const VARIABLE_TEMPLATE_VARIANT_SLOT_COUNT = 5;

export const VARIABLE_BULK_UPLOAD_COLUMN_PATTERNS: RegExp[] = [
  /^attribute details$/,
  /^attribute details \d+$/,
  /^attribute \d+ name$/,
  /^attribute \d+ value$/,
  /^att_[a-z0-9_]+_\d+$/,
  /^att_image_url_\d+_\d+$/,
  /^att_image_\d+_\d+$/,
  /^att_attribute_\d+_value_\d+$/,
];

export interface IInlineVariantSlot {
  mrp?: number;
  sellingPrice?: number;
  stock?: number;
  discountType?: string;
  discountPercentage?: number;
  discountValue?: number;
  weight?: number;
  weightUnit?: string;
  length?: number;
  lengthUnit?: string;
  width?: number;
  widthUnit?: string;
  height?: number;
  heightUnit?: string;
  attributeValues: Map<number, string>;
  images: Array<{ filename?: string; url?: string; sortOrder: number }>;
}

export const isVariableBulkUploadColumn = (normalizedHeader: string): boolean =>
  VARIABLE_BULK_UPLOAD_COLUMN_PATTERNS.some((pattern) => pattern.test(normalizedHeader));

export const parsePipeSeparatedValues = (raw: string): string[] => [
  ...new Set(
    raw
      .split('|')
      .map((value) => value.trim())
      .filter(Boolean),
  ),
];

export const parseAttributeDetailNames = (raw?: string): string[] =>
  raw?.trim() ? parsePipeSeparatedValues(raw) : [];

/** Flattens one or more cells that may each contain pipe-separated attribute names. */
export const flattenAttributeDetailNames = (rawValues: string[]): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of rawValues) {
    for (const name of parsePipeSeparatedValues(raw)) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(name);
    }
  }

  return result;
};

/** Reads `Attribute Details 1..N` columns (dynamic N); falls back to legacy pipe-separated `Attribute Details`. */
export const parseAttributeDetailsFromRow = (
  getVal: (columnName: string) => string,
  headerMap: Map<string, number>,
): string[] => {
  const indexedColumns: number[] = [];
  for (const header of headerMap.keys()) {
    const match = header.match(/^attribute details (\d+)$/);
    if (match) {
      indexedColumns.push(parseInt(match[1], 10));
    }
  }

  const rawValues: string[] = [];

  if (indexedColumns.length > 0) {
    indexedColumns.sort((left, right) => left - right);
    for (const index of indexedColumns) {
      const value = getVal(`attribute details ${index}`).trim();
      if (value) rawValues.push(value);
    }
  }

  const legacyValue = getVal('attribute details').trim();
  if (legacyValue) {
    rawValues.push(legacyValue);
  }

  return flattenAttributeDetailNames(rawValues);
};

export const getMaxAttributeDetailsColumnIndex = (headerMap: Map<string, number>): number => {
  let maxIndex = VARIABLE_TEMPLATE_ATTRIBUTE_COUNT;
  for (const header of headerMap.keys()) {
    const match = header.match(/^attribute details (\d+)$/);
    if (!match) continue;
    maxIndex = Math.max(maxIndex, parseInt(match[1], 10));
  }
  return maxIndex;
};

/** Template headers: Attribute Details 1..count (supports extending beyond 5 in sheet). */
export const buildAttributeDetailsHeaders = (
  count = VARIABLE_TEMPLATE_ATTRIBUTE_COUNT,
): string[] =>
  Array.from({ length: count }, (_, index) => `Attribute Details ${index + 1}`);

const extractPrefix = (name: string, fallback: string): string => {
  const letters = (name.match(/[a-zA-Z]/g) ?? []).join('').toUpperCase();
  if (!letters) return fallback;
  return letters.slice(0, 3).padEnd(3, 'X');
};

export const buildSkuPrefix = (categoryName: string, brandName: string): string => {
  const categoryPrefix = extractPrefix(categoryName, 'CAT');
  const brandPrefix = extractPrefix(brandName, 'GEN');
  return `${categoryPrefix}/${brandPrefix}/`;
};

export const formatGeneratedSku = (prefix: string, sequence: number): string =>
  `${prefix}${String(sequence).padStart(3, '0')}`;

export const findMaxSkuSequenceForPrefix = (
  prefix: string,
  existingSkus: Iterable<string>,
): number => {
  const normalizedPrefix = prefix.toLowerCase();
  let max = 0;

  for (const sku of existingSkus) {
    const normalized = sku.toLowerCase().trim();
    if (!normalized.startsWith(normalizedPrefix)) continue;
    const suffix = normalized.slice(normalizedPrefix.length);
    const parsed = parseInt(suffix, 10);
    if (!Number.isNaN(parsed)) {
      max = Math.max(max, parsed);
    }
  }

  return max;
};

export interface IAttColumnMeta {
  field: string;
  variantIndex: number;
  attributeIndex?: number;
  imageIndex?: number;
}

export const parseAttColumnHeader = (normalizedHeader: string): IAttColumnMeta | null => {
  const attributeValueMatch = normalizedHeader.match(/^att_attribute_(\d+)_value_(\d+)$/);
  if (attributeValueMatch) {
    return {
      field: 'attribute_value',
      attributeIndex: parseInt(attributeValueMatch[1], 10),
      variantIndex: parseInt(attributeValueMatch[2], 10),
    };
  }

  const imageUrlMatch = normalizedHeader.match(/^att_image_url_(\d+)_(\d+)$/);
  if (imageUrlMatch) {
    return {
      field: 'image_url',
      variantIndex: parseInt(imageUrlMatch[1], 10),
      imageIndex: parseInt(imageUrlMatch[2], 10),
    };
  }

  const imageMatch = normalizedHeader.match(/^att_image_(\d+)_(\d+)$/);
  if (imageMatch) {
    return {
      field: 'image',
      variantIndex: parseInt(imageMatch[1], 10),
      imageIndex: parseInt(imageMatch[2], 10),
    };
  }

  const match = normalizedHeader.match(/^att_(.+)_(\d+)$/);
  if (!match) return null;

  return {
    field: match[1],
    variantIndex: parseInt(match[2], 10),
  };
};

export const createEmptyInlineVariantSlot = (): IInlineVariantSlot => ({
  attributeValues: new Map<number, string>(),
  images: [],
});

export const isInlineVariantSlotUsed = (slot?: IInlineVariantSlot): boolean => {
  if (!slot) return false;
  return (
    slot.mrp !== undefined ||
    slot.sellingPrice !== undefined ||
    slot.stock !== undefined ||
    slot.attributeValues.size > 0 ||
    slot.images.length > 0 ||
    slot.weight !== undefined ||
    slot.length !== undefined ||
    slot.width !== undefined ||
    slot.height !== undefined
  );
};

/** Full per-variant slot columns (up to 5 variants on one row). */
export const buildAttVariantSlotHeaders = (
  slotCount = VARIABLE_TEMPLATE_VARIANT_SLOT_COUNT,
): string[] => {
  const perSlotFields = [
    'mrp',
    'selling_price',
    'stock',
    'weight',
    'weight_unit',
    'length',
    'length_unit',
    'width',
    'width_unit',
    'height',
    'height_unit',
    'discount_type',
    'discount_percentage',
    'discount_value',
  ] as const;

  const headers: string[] = [];
  for (let slot = 1; slot <= slotCount; slot++) {
    for (const field of perSlotFields) {
      headers.push(`att_${field}_${slot}`);
    }
    for (let attributeIndex = 1; attributeIndex <= VARIABLE_TEMPLATE_ATTRIBUTE_COUNT; attributeIndex++) {
      headers.push(`att_attribute_${attributeIndex}_value_${slot}`);
    }
    for (let imageIndex = 1; imageIndex <= BULK_UPLOAD_VARIANT_IMAGE_COUNT; imageIndex++) {
      headers.push(`att_image_${slot}_${imageIndex}`, `att_image_url_${slot}_${imageIndex}`);
    }
  }
  return headers;
};

/** Variable-only columns appended into the unified bulk upload template. */
export const buildVariableTemplateExtraHeaders = (): string[] => [
  ...buildAttributeDetailsHeaders(),
  ...buildAttVariantSlotHeaders(),
];

export const buildVariantCombinationKeyFromRefIds = (
  attributes: Array<{ attributeRefId: string; value: string }>,
): string | null => {
  const inputs: IVariantAttributeInput[] = attributes.map((attribute) => ({
    attributeId: attribute.attributeRefId,
    value: attribute.value,
  }));
  return buildVariantCombinationKey(inputs);
};

export const findDuplicateCombinationLabels = (
  variantAttributes: Array<Array<{ attributeRefId: string; value: string; label?: string }>>,
): string[] => {
  const keys = variantAttributes.map((attributes) =>
    buildVariantCombinationKeyFromRefIds(attributes),
  );
  const duplicateKeys = findDuplicateCombinationKeys(keys);
  if (!duplicateKeys.length) return [];

  const labels: string[] = [];
  const seen = new Set<string>();

  variantAttributes.forEach((attributes, index) => {
    const key = keys[index];
    if (!key || !duplicateKeys.includes(key) || seen.has(key)) return;
    seen.add(key);
    labels.push(
      attributes
        .map((attribute) => `${attribute.label ?? attribute.attributeRefId}=${attribute.value}`)
        .join(' + '),
    );
  });

  return labels;
};
