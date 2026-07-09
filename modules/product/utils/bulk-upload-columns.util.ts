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
  'Brand',
  'Health Concerns',
  'Wellness Goals',
  'Product Tags',
  'Vendor',
  'Vendor SKU',
  'Product ID (String)',
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
  'Attribute 1 Name',
  'Attribute 1 Value',
  'Attribute 2 Name',
  'Attribute 2 Value',
  'Attribute 3 Name',
  'Attribute 3 Value',
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
  'Gallery Image 2',
  'Gallery Image 3',
  'Gallery Image 4',
  'Gallery Image 5',
  'Meta Title',
  'Meta Description',
  'Slug URL',
  'Meta Keywords',
  'Category Filters',
  'Size Chart Filename/Path',
  'Subscription Available',
  'Return Policy',
  'Return Window Days',
  'COD Available',
  'EMI Available',
  'Replacement Allowed',
  'Replacement Window Days',
  'Manufacturer',
  'Manufacturer Address',
  'Packer',
  'Packer Address',
  'Importer',
  'Importer Address',
  'Country of Origin',
  'Components',
  'Shelf Life in Months',
  'Product Status',
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

export const isFixedBulkUploadColumn = (normalizedHeader: string): boolean =>
  FIXED_BULK_UPLOAD_COLUMNS.has(normalizedHeader);

export const buildBulkUploadTemplateHeaders = (
  productInformationLabelNames: string[],
): string[] => {
  const variantStatusIndex = BULK_UPLOAD_FIXED_COLUMN_HEADERS.indexOf('Variant Status');
  const beforeInfo = BULK_UPLOAD_FIXED_COLUMN_HEADERS.slice(0, variantStatusIndex + 1);
  const afterInfo = BULK_UPLOAD_FIXED_COLUMN_HEADERS.slice(variantStatusIndex + 1);
  return [...beforeInfo, ...productInformationLabelNames, ...afterInfo];
};
