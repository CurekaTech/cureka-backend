/** Normalizes spreadsheet header text for lookup (matches parser cleanHeader). */
export const normalizeBulkUploadHeader = (header: string): string =>
  header.toLowerCase().replace(/\*/g, '').replace(/\s+/g, ' ').trim();

/** Canonical bulk-upload column order (fixed columns only). */
export const BULK_UPLOAD_FIXED_COLUMN_HEADERS = [
  'Product Name*',
  'Product Nature *',
  'Product Type *',
  'Category *',
  'Sub Category',
  'Sub Sub Category',
  'Sub Sub Sub Category',
  'Brand*',
  'Health Concerns',
  'Wellness Goals',
  'Product Tags',
  'Vendor',
  'Vendor Name',
  'Vendor SKU',
  'Product ID (String)',
  'Product Id',
  'Product SKU Code*',
  'Barcode (EAN/UPC)',
  'GTIN Number',
  'HSN Code',
  'Batch Number',
  'Expiry Date',
  'Single Product URL',
  'Pack SKU Code 1',
  'Barcode 1 (EAN/UPC)',
  'Pack Product ID 1',
  'URL Pack 1',
  'Pack Unit 1',
  'Pack MRP 1',
  'Pack Selling Price 1',
  'Pack Name 2',
  'Pack SKU Code 2',
  'Barcode 2 (EAN/UPC)',
  'Pack Product ID 2',
  'URL Pack 2',
  'Pack Unit 2',
  'Pack MRP 2',
  'Pack Selling Price 2',
  'Pack Name 3',
  'Pack SKU Code 3',
  'Barcode 3 (EAN/UPC)',
  'Pack Product ID 3',
  'URL Pack 3',
  'Pack Unit 3',
  'Pack MRP 3',
  'Pack Selling Price 3',
  'Pack Name 4',
  'Pack SKU Code 4',
  'Barcode 4 (EAN/UPC)',
  'Pack Product ID 4',
  'URL Pack 4',
  'Pack Unit 4',
  'Pack MRP 4',
  'Pack Selling Price 4',
  'Bundle SKU',
  'Bundle MRP (Rs)',
  'Bundle Selling Price (Rs)',
  'Child Product Name',
  'Child SKU',
  'Child MRP (Rs)',
  'Child Selling Price (Rs)',
  'Child Quantity',
  'MRP (Rs)*',
  'Selling Price (Rs)*',
  'Discount Price (RS)',
  'Discount Percentage',
  'Tax Class',
  'Quantity / Stock',
  'Weight (kg)',
  'Weight Unit',
  'Length (cm)',
  'Width (cm)',
  'Height (cm)',
  'Dimension Unit',
  'Variant Status',
  'Product Highlights',
  'Safety Information',
  'Feeding Table',
  'Direction of Use',
  'Preventive Note',
  'Key Ingredients',
  'Description',
  'Size Chart',
  'Accessories',
  'Other Ingredients',
  'Expert Advice',
  'Key Benefits',
  'FAQ 1 Question',
  'FAQ 1 Answer',
  'FAQ 2 Question',
  'FAQ 2 Answer',
  'FAQ 3 Question',
  'FAQ 3 Answer',
  'FAQ 4 Question',
  'FAQ 4 Answer',
  'FAQ 5 Question',
  'FAQ 5 Answer',
  'FAQ 6 Question',
  'FAQ 6 Answer',
  'FAQ 7 Question',
  'FAQ 7 Answer',
  'FAQ 8 Question',
  'FAQ 8 Answer',
  'FAQ 9 Question',
  'FAQ 9 Answer',
  'FAQ 10 Question',
  'FAQ 10 Answer',
  'Primary Image Filename',
  'Primary Image URL',
  'Gallery Image 2',
  'Gallery Image 2 URL',
  'Gallery Image 2 (Video)',
  'Gallery Image 2 (Video) URL',
  'Gallery Image 3',
  'Gallery Image 3 URL',
  'Gallery Image 4',
  'Gallery Image 4 URL',
  'Gallery Image 5',
  'Gallery Image 5 URL',
  'common_media_1',
  'common_media_1_url',
  'common_media_2',
  'common_media_2_url',
  'common_media_3',
  'common_media_3_url',
  'common_media_4',
  'common_media_4_url',
  'common_media_5',
  'common_media_5_url',
  'Meta Title',
  'Meta Description',
  'Slug URL',
  'Meta Keywords',
  'Category Filters',
  'Size Chart Filename/Path',
  'Size Chart URL',
  'Subscription Available',
  'Return Policy',
  'Return Window Days',
  'COD Available',
  'EMI Available',
  'Replacement Allowed',
  'Replacement Window Days',
  'Manufacturer',
  'Manufacturer Name',
  'Manufacturer Address',
  'Packer',
  'Packer Name',
  'Packer Address',
  'Importer',
  'Importer Name',
  'Importer Address',
  'Country of Origin',
  'Components',
  'Shelf Life in Months',
  'Product Status',
  'Usage and Safety',
  'Ingredients and Nutrition',
  'Compliance Detail',
  'Additional Info',
  'Indications',
  'Kit Contains',
  'Offers',
] as const;

/**
 * Spreadsheet columns handled outside product_information_labels.
 * Any other column must match an active product information label name.
 */
export const FIXED_BULK_UPLOAD_COLUMNS = new Set(
  BULK_UPLOAD_FIXED_COLUMN_HEADERS.map(normalizeBulkUploadHeader),
);

/** Legacy spreadsheet headers mapped to current product_information_labels.name values. */
export const LEGACY_PRODUCT_INFORMATION_HEADER_ALIASES = new Map<string, string>(
  [
    ['preventive notes', 'Preventive Note'],
    ['preventive note', 'Preventive Note'],
    ['product highlights', 'Product Highlights'],
    ['key benefits', 'Key Benefits'],
    ['expert advice', 'Expert Advice'],
    ['key ingredients', 'Key Ingredients'],
    ['other ingredients', 'Other Ingredients'],
  ].map(([legacy, label]) => [legacy, label] as const),
);

export type BulkUploadProductInformationLabel = {
  name: string;
  sortOrder: number;
  status: string;
};

export const resolveProductInformationLabelName = (
  normalizedHeader: string,
  activeLabelsByNormalizedName: ReadonlyMap<string, BulkUploadProductInformationLabel>,
): string | null => {
  const direct = activeLabelsByNormalizedName.get(normalizedHeader);
  if (direct) {
    return direct.name;
  }

  const alias = LEGACY_PRODUCT_INFORMATION_HEADER_ALIASES.get(normalizedHeader);
  if (!alias) {
    return null;
  }

  const normalizedAlias = normalizeBulkUploadHeader(alias);
  return activeLabelsByNormalizedName.get(normalizedAlias)?.name ?? null;
};

/**
 * Legacy columns removed from the current template.
 * Old spreadsheets may still include these headers — they are ignored (not imported).
 */
export const DEPRECATED_BULK_UPLOAD_COLUMNS = new Set(
  [
    'Key Features',
    'ds',
    'test',
    'test_2',
    'test_3',
  ].map(normalizeBulkUploadHeader),
);

export const isDeprecatedBulkUploadColumn = (normalizedHeader: string): boolean =>
  DEPRECATED_BULK_UPLOAD_COLUMNS.has(normalizedHeader);

export const buildCategoryFilterColumnHeader = (filterName: string): string =>
  `CF_${filterName.trim()}`;

/**
 * Category-filter columns are `CF_<name>` (canonical).
 * Also accept `CF <name>` because some spreadsheet editors turn `_` into a space.
 */
export const isBulkUploadCategoryFilterColumn = (normalizedHeader: string): boolean =>
  /^cf([_\s]|$)/i.test(normalizedHeader);

/** Extract filter name from a raw or normalized CF header (`CF_Age Group` / `cf age group`). */
export const parseCategoryFilterNameFromHeader = (header: string): string | null => {
  const trimmed = header.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^CF[_\s]+(.+)$/i);
  if (!match?.[1]) return null;

  const name = match[1].trim();
  return name || null;
};

import {
  buildVariableTemplateExtraHeaders,
  isVariableBulkUploadColumn,
} from './bulk-upload-variable.util';
import { isCommonMediaBulkUploadColumn } from './bulk-upload-image.util';

export { buildVariableTemplateExtraHeaders, isVariableBulkUploadColumn };
export { isCommonMediaBulkUploadColumn, buildCommonMediaTemplateHeaders } from './bulk-upload-image.util';

export const isFixedBulkUploadColumn = (normalizedHeader: string): boolean =>
  FIXED_BULK_UPLOAD_COLUMNS.has(normalizedHeader) || isCommonMediaBulkUploadColumn(normalizedHeader);

const dedupeHeadersByNormalizedName = (headers: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const header of headers) {
    const normalized = normalizeBulkUploadHeader(header);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(header);
  }
  return result;
};

/**
 * One sheet for mixed simple + variable uploads.
 * Includes simple/bundle columns, explicit variant columns, inline variant slot columns, and CF_ columns.
 */
export const buildUnifiedBulkUploadHeaders = (
  categoryFilterHeaders: string[] = [],
): string[] => {
  const baseHeaders = buildBulkUploadTemplateHeaders();
  const bundleSkuIndex = baseHeaders.findIndex(
    (header) => normalizeBulkUploadHeader(header) === normalizeBulkUploadHeader('Bundle SKU'),
  );
  const insertAt = bundleSkuIndex >= 0 ? bundleSkuIndex : baseHeaders.length;

  return dedupeHeadersByNormalizedName([
    ...baseHeaders.slice(0, insertAt),
    ...buildVariableTemplateExtraHeaders(),
    ...baseHeaders.slice(insertAt),
    ...categoryFilterHeaders,
  ]);
};

const CLIENT_TEMPLATE_HEADER_EXCLUSIONS = new Set([
  'Product Nature *',
  'Vendor',
  'Vendor Name',
  'Vendor SKU',
  'Product ID (String)',
  'Manufacturer',
  'Packer',
  'Importer',
  'Gallery Image 2',
  'Category Filters',
]);

export const buildBulkUploadTemplateHeaders = (
  extraProductInformationLabels: string[] = [],
): string[] => {
  const baseHeaders = BULK_UPLOAD_FIXED_COLUMN_HEADERS.filter(
    (header) => !CLIENT_TEMPLATE_HEADER_EXCLUSIONS.has(header),
  );

  const knownHeaders = new Set(baseHeaders.map(normalizeBulkUploadHeader));
  const extras = extraProductInformationLabels.filter((label) => {
    const normalized = normalizeBulkUploadHeader(label);
    return (
      !knownHeaders.has(normalized) &&
      !isDeprecatedBulkUploadColumn(normalized) &&
      !isFixedBulkUploadColumn(normalized)
    );
  });

  if (!extras.length) {
    return [...baseHeaders];
  }

  const variantStatusIndex = baseHeaders.findIndex(
    (header) => normalizeBulkUploadHeader(header) === normalizeBulkUploadHeader('Variant Status'),
  );
  const index = variantStatusIndex >= 0 ? variantStatusIndex : baseHeaders.length - 1;
  return [...baseHeaders.slice(0, index + 1), ...extras, ...baseHeaders.slice(index + 1)];
};
