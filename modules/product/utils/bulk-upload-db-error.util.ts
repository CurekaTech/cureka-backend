import type { IParsedProductGroup, IParsedVariant } from '../services/bulk-upload-parser.service';

export type BulkUploadLengthField = {
  column: string;
  value: string;
  maxLength: number;
  rowNumber?: number;
  sku?: string;
};

/**
 * Declared max lengths must match product / product_variant entity columns.
 * Keep in sync when entity lengths change.
 */
export const BULK_UPLOAD_PRODUCT_FIELD_LIMITS = [
  { column: 'Product Name', maxLength: 500, getValue: (g: IParsedProductGroup) => g.name },
  { column: 'Slug URL', maxLength: 500, getValue: (g: IParsedProductGroup) => g.slugUrl },
  { column: 'Meta Title', maxLength: 500, getValue: (g: IParsedProductGroup) => g.metaTitle },
  {
    column: 'Product ID (String)',
    maxLength: 255,
    getValue: (g: IParsedProductGroup) => g.externalProductId,
  },
  {
    column: 'Single Product URL',
    maxLength: 1000,
    getValue: (g: IParsedProductGroup) => g.singleProductUrl,
  },
  { column: 'Vendor', maxLength: 255, getValue: (g: IParsedProductGroup) => g.vendor },
  { column: 'Vendor SKU', maxLength: 100, getValue: (g: IParsedProductGroup) => g.vendorSku },
] as const;

export const BULK_UPLOAD_VARIANT_FIELD_LIMITS = [
  {
    column: 'Product SKU Code',
    maxLength: 100,
    getValue: (v: IParsedVariant) => v.sku,
  },
  {
    column: 'Product URL Slug',
    maxLength: 500,
    getValue: (v: IParsedVariant) => v.productUrlSlug,
  },
  {
    column: 'Product ID (String)',
    maxLength: 255,
    getValue: (v: IParsedVariant) => v.externalProductId,
  },
  {
    column: 'Barcode (EAN/UPC)',
    maxLength: 100,
    getValue: (v: IParsedVariant) => v.barcode,
  },
  {
    column: 'GTIN Number',
    maxLength: 100,
    getValue: (v: IParsedVariant) => v.gtinNumber,
  },
  {
    column: 'HSN Code',
    maxLength: 50,
    getValue: (v: IParsedVariant) => v.hsnCode,
  },
  {
    column: 'Batch Number',
    maxLength: 100,
    getValue: (v: IParsedVariant) => v.batchNumber,
  },
  {
    column: 'Tax Class',
    maxLength: 100,
    getValue: (v: IParsedVariant) => v.taxClass,
  },
  {
    column: 'Weight Unit',
    maxLength: 100,
    getValue: (v: IParsedVariant) => v.weightUnit,
  },
  {
    column: 'Dimension Unit',
    maxLength: 100,
    getValue: (v: IParsedVariant) => v.lengthUnit || v.widthUnit || v.heightUnit,
  },
  {
    column: 'Meta Title',
    maxLength: 500,
    getValue: (v: IParsedVariant) => v.metaTitle,
  },
  {
    column: 'Single Product URL',
    maxLength: 1000,
    getValue: (v: IParsedVariant) => v.singleProductUrl,
  },
] as const;

export function collectBulkUploadLengthOverflows(
  group: IParsedProductGroup,
): BulkUploadLengthField[] {
  const overflows: BulkUploadLengthField[] = [];

  for (const field of BULK_UPLOAD_PRODUCT_FIELD_LIMITS) {
    const value = field.getValue(group)?.trim();
    if (!value) continue;
    if (value.length > field.maxLength) {
      overflows.push({
        column: field.column,
        value,
        maxLength: field.maxLength,
        rowNumber: group.rowNumber,
        sku: group.variants[0]?.sku,
      });
    }
  }

  for (const variant of group.variants ?? []) {
    for (const field of BULK_UPLOAD_VARIANT_FIELD_LIMITS) {
      const value = field.getValue(variant)?.trim();
      if (!value) continue;
      if (value.length > field.maxLength) {
        overflows.push({
          column: field.column,
          value,
          maxLength: field.maxLength,
          rowNumber: variant.rowNumber,
          sku: variant.sku,
        });
      }
    }
  }

  return overflows;
}

/**
 * When Postgres raises "value too long for type character varying(N)",
 * pick the sheet field most likely to have caused it (longest overflow vs N).
 */
export function findLikelyValueTooLongField(
  group: IParsedProductGroup,
  dbMessage: string,
): BulkUploadLengthField | null {
  const match = dbMessage.match(/character varying\((\d+)\)/i);
  const dbLimit = match ? Number.parseInt(match[1], 10) : undefined;

  const candidates: BulkUploadLengthField[] = [];

  const consider = (
    column: string,
    raw: string | undefined,
    declaredMax: number,
    rowNumber?: number,
    sku?: string,
  ) => {
    const value = raw?.trim();
    if (!value) return;
    const limit = dbLimit ?? declaredMax;
    if (value.length > limit) {
      candidates.push({ column, value, maxLength: limit, rowNumber, sku });
    }
  };

  for (const field of BULK_UPLOAD_PRODUCT_FIELD_LIMITS) {
    consider(field.column, field.getValue(group), field.maxLength, group.rowNumber, group.variants[0]?.sku);
  }
  for (const variant of group.variants ?? []) {
    for (const field of BULK_UPLOAD_VARIANT_FIELD_LIMITS) {
      consider(
        field.column,
        field.getValue(variant),
        field.maxLength,
        variant.rowNumber,
        variant.sku,
      );
    }
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => b.value.length - a.value.length);
  return candidates[0];
}

export function formatLengthOverflowReason(field: BulkUploadLengthField): string {
  return `${field.column} is ${field.value.length} characters; maximum allowed is ${field.maxLength}.`;
}

export function formatLengthOverflowSuggestedFix(field: BulkUploadLengthField): string {
  return `Shorten "${field.column}" to ${field.maxLength} characters or fewer, then re-upload.`;
}

export type MappedBulkUploadDbError = {
  column: string;
  invalidValue: string;
  reason: string;
  suggestedFix: string;
  rowNumber?: number;
  sku?: string;
};

/**
 * Map common DB / Nest exceptions to actionable sheet error columns.
 */
export function mapBulkUploadDbError(
  group: IParsedProductGroup,
  dbMessage: string,
): MappedBulkUploadDbError {
  const message = dbMessage.trim() || 'Unknown database error';

  if (/value too long for type character varying/i.test(message)) {
    const field = findLikelyValueTooLongField(group, message);
    if (field) {
      return {
        column: field.column,
        invalidValue: field.value,
        reason: `${formatLengthOverflowReason(field)} (database: ${message})`,
        suggestedFix: formatLengthOverflowSuggestedFix(field),
        rowNumber: field.rowNumber,
        sku: field.sku,
      };
    }
    return {
      column: 'Database',
      invalidValue: group.name || '',
      reason: message,
      suggestedFix:
        'A text field exceeds its database length limit. Shorten Meta Title, Product Name, SKU, Product ID, or URL fields and retry.',
    };
  }

  if (
    /product type cannot be changed|converting to a single product|converting a variant product|single products cannot have variant attributes|simple products must have exactly one variant|simple products cannot have variant attributes|variant attribute/i.test(
      message,
    )
  ) {
    return {
      column: 'Product Type',
      invalidValue: group.productType,
      reason: message,
      suggestedFix:
        'For simple→variable: use style_group_id with ≥2 rows and distinct attributes. For variable→simple: keep exactly 1 row, clear style_group_id, set Product Type=simple.',
    };
  }

  if (/duplicate key|unique constraint|already exists/i.test(message)) {
    const skuHit = group.variants?.find((v) => v.sku && message.toLowerCase().includes(v.sku.toLowerCase()));
    if (/sku/i.test(message) || skuHit) {
      return {
        column: 'Product SKU Code',
        invalidValue: skuHit?.sku || group.variants?.[0]?.sku || '',
        reason: message,
        suggestedFix: 'Use a unique Product SKU Code that is not already assigned to another product.',
        rowNumber: skuHit?.rowNumber,
        sku: skuHit?.sku,
      };
    }
    if (/slug/i.test(message)) {
      return {
        column: 'Slug URL',
        invalidValue: group.slugUrl || '',
        reason: message,
        suggestedFix: 'Choose a unique Slug URL / Product URL Slug that is not already in use.',
      };
    }
    if (/external_product_id|product id/i.test(message)) {
      return {
        column: 'Product ID (String)',
        invalidValue: group.externalProductId || '',
        reason: message,
        suggestedFix: 'Use a unique Product ID (String), or update the existing product that already owns this ID.',
      };
    }
    return {
      column: 'Database',
      invalidValue: group.name || '',
      reason: message,
      suggestedFix: 'A unique value already exists. Check SKU, Slug URL, and Product ID (String) for conflicts.',
    };
  }

  if (/foreign key|violates foreign key/i.test(message)) {
    return {
      column: 'Database',
      invalidValue: group.name || '',
      reason: message,
      suggestedFix:
        'A related master record is missing or inactive (brand, category, nature, manufacturer, etc.). Fix master data and retry.',
    };
  }

  if (/not-null|null value in column/i.test(message)) {
    const columnMatch = message.match(/null value in column "([^"]+)"/i);
    const dbColumn = columnMatch?.[1];
    const sheetColumn =
      dbColumn === 'name'
        ? 'Product Name'
        : dbColumn === 'category_id'
          ? 'Category'
          : dbColumn === 'brand_id'
            ? 'Brand'
            : dbColumn === 'sku'
              ? 'Product SKU Code'
              : 'Database';
    return {
      column: sheetColumn,
      invalidValue: '',
      reason: message,
      suggestedFix: `Fill the required field${sheetColumn !== 'Database' ? ` (${sheetColumn})` : ''} and re-upload.`,
    };
  }

  return {
    column: 'Database',
    invalidValue: group.name || '',
    reason: message,
    suggestedFix: 'Check the failing row values against master data and unique fields (SKU, slug, product ID), then retry.',
  };
}
