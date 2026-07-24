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
  /^style[\s_-]*group[\s_-]*id$/,
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
  /** Maps to product_variants.slug when provided. */
  productUrlSlug?: string;
  attributeValues: Map<number, string>;
  images: Array<{ filename?: string; url?: string; sortOrder: number }>;
}

export const isVariableBulkUploadColumn = (normalizedHeader: string): boolean =>
  VARIABLE_BULK_UPLOAD_COLUMN_PATTERNS.some((pattern) => pattern.test(normalizedHeader));

export const parsePipeSeparatedValues = (raw: string): string[] => [
  ...new Set(
    raw
      .split(/[|,]+/)
      .map((value) => value.trim())
      .filter(Boolean),
  ),
];

/** Split attribute value cells on `,` or `|` into distinct values (e.g. "Left, Right"). */
export const parseDelimitedAttributeValues = (raw: string): string[] =>
  parsePipeSeparatedValues(raw);

export const parseAttributeDetailNames = (raw?: string): string[] =>
  raw?.trim() ? parsePipeSeparatedValues(raw) : [];

/** Flattens one or more cells that may each contain pipe/comma-separated attribute names. */
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

/**
 * Indexed `Attribute Details N` columns are one attribute name per column
 * (e.g. "Left / Right" must stay a single master name — do not split on `/`).
 * Legacy single `Attribute Details` cell still supports `,` / `|` separators.
 */
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

  if (indexedColumns.length > 0) {
    indexedColumns.sort((left, right) => left - right);
    const names: string[] = [];
    for (const index of indexedColumns) {
      const value = getVal(`attribute details ${index}`).trim();
      if (value) names.push(value);
    }
    return names;
  }

  const legacyValue = getVal('attribute details').trim();
  return legacyValue ? flattenAttributeDetailNames([legacyValue]) : [];
};

/** Cartesian product of value lists (at least one empty list → empty result). */
export const cartesianProduct = <T>(lists: T[][]): T[][] => {
  if (!lists.length) return [[]];
  return lists.reduce<T[][]>(
    (acc, list) => {
      if (!list.length) return [];
      const next: T[][] = [];
      for (const prefix of acc) {
        for (const item of list) {
          next.push([...prefix, item]);
        }
      }
      return next;
    },
    [[]],
  );
};

export type BulkUploadExpandableVariant = {
  sku?: string;
  externalProductId?: string;
  productUrlSlug?: string;
  attributes: Array<{ name: string; value: string }>;
  [key: string]: unknown;
};

/**
 * Expand a variant row when any attribute value cell contains `,` or `|`
 * (e.g. Size=Small + "Left, Right" → Small/Left and Small/Right).
 * First combination keeps sheet SKU / Product ID; extras get blank SKU for auto-assign.
 */
export const expandVariantsByDelimitedAttributeValues = <T extends BulkUploadExpandableVariant>(
  variants: T[],
): T[] => {
  const expanded: T[] = [];

  for (const variant of variants) {
    const attrs = variant.attributes ?? [];
    if (!attrs.length) {
      expanded.push(variant);
      continue;
    }

    const valueLists = attrs.map((attr) => {
      const values = parseDelimitedAttributeValues(attr.value ?? '');
      return values.length ? values : [attr.value?.trim() || ''];
    });

    const needsExpansion = valueLists.some((values) => values.length > 1);
    if (!needsExpansion) {
      expanded.push({
        ...variant,
        attributes: attrs.map((attr, index) => ({
          name: attr.name,
          value: valueLists[index][0] ?? attr.value,
        })),
      });
      continue;
    }

    const combinations = cartesianProduct(valueLists);
    combinations.forEach((combo, index) => {
      expanded.push({
        ...variant,
        sku: index === 0 ? variant.sku : '',
        externalProductId: index === 0 ? variant.externalProductId : undefined,
        productUrlSlug: index === 0 ? variant.productUrlSlug : undefined,
        attributes: attrs.map((attr, attrIndex) => ({
          name: attr.name,
          value: combo[attrIndex] ?? '',
        })),
      });
    });
  }

  return expanded;
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
    'product_url_slug',
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

/** Vertical rows use slot `_1` only (one value column per attribute name). */
export const buildVerticalAttributeValueHeaders = (
  count = VARIABLE_TEMPLATE_ATTRIBUTE_COUNT,
): string[] =>
  Array.from({ length: count }, (_, index) => `att_attribute_${index + 1}_value_1`);

/** Variable-only columns: Attribute Details + per-row values (no horizontal att_mrp_N slots). */
export const buildVariableTemplateExtraHeaders = (): string[] => [
  ...buildAttributeDetailsHeaders(),
  ...buildVerticalAttributeValueHeaders(),
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
