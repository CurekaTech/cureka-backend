import * as ExcelJS from 'exceljs';

/** Collapse whitespace and trim. Empty strings become ''. */
export const normalizeValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
};

/** Case-insensitive comparison key. */
export const toLookupKey = (value: string): string => normalizeValue(value).toLowerCase();

/**
 * Comma-splitting is only safe for short master labels
 * (e.g. "Fragrance Free, Clinically Proven").
 * Skip prose, FAQs, HTML, and long ingredient lists.
 */
export const shouldSplitOnCommas = (value: string): boolean => {
  const normalized = normalizeValue(value);
  if (!normalized.includes(',')) return false;
  if (/[.?!;:]/.test(normalized)) return false;
  if (/<\/?[a-z]/i.test(normalized)) return false;

  const parts = normalized
    .split(',')
    .map((part) => normalizeValue(part))
    .filter(Boolean);

  if (parts.length < 2 || parts.length > 8) return false;

  return parts.every(
    (part) => part.length <= 60 && part.split(/\s+/).length <= 6,
  );
};

/**
 * Category-filter values should be short labels, not FAQ / HTML / ingredient dumps
 * that leaked in from wide product export sheets.
 */
export const isLikelyInvalidCategoryFilterValue = (value: string): boolean => {
  const normalized = normalizeValue(value);
  if (!normalized) return true;
  if (normalized.length > 100) return true;
  if (/<\/?[a-z]/i.test(normalized)) return true;
  if (/[.?!]/.test(normalized)) return true;
  // FAQ answers like "Yes, ..." / "No. ..." — not "No added Preservatives"
  if (/^(yes|no)[,.](\s|$)/i.test(normalized)) return true;
  if (normalized.split(/\s+/).length > 12) return true;
  return false;
};

/**
 * Health-concern names should be short concern labels, not product FAQ copy.
 */
export const isLikelyInvalidHealthConcernName = (value: string): boolean => {
  const normalized = normalizeValue(value);
  if (!normalized) return true;
  if (normalized.length > 100) return true;
  if (/[.?!]/.test(normalized)) return true;
  if (/^(yes|no)[,.](\s|$)/i.test(normalized)) return true;
  if (normalized.split(/\s+/).length > 10) return true;
  return false;
};

/**
 * Split into separate entries:
 * - `|` always splits
 * - `,` splits only for short label-style lists
 * - `/` is never a separator
 */
export const splitMultiValues = (raw: string): string[] => {
  const normalized = normalizeValue(raw);
  if (!normalized) return [];

  const pipeParts = normalized
    .split('|')
    .map((part) => normalizeValue(part))
    .filter(Boolean);

  const expanded: string[] = [];
  for (const part of pipeParts) {
    if (shouldSplitOnCommas(part)) {
      expanded.push(
        ...part
          .split(',')
          .map((item) => normalizeValue(item))
          .filter(Boolean),
      );
    } else {
      expanded.push(part);
    }
  }

  return uniqueIgnoreCase(expanded);
};

/** Expand an existing values[] that may still contain joinable separators from older imports. */
export const expandArrayValues = (values: string[] | null | undefined): string[] =>
  uniqueIgnoreCase((values ?? []).flatMap((value) => splitMultiValues(value)));

/** True when a stored label should be repaired into multiple entries. */
export const hasMultiValueSeparators = (value: string): boolean => {
  const normalized = normalizeValue(value);
  if (!normalized) return false;
  if (normalized.includes('|')) return true;
  return shouldSplitOnCommas(normalized);
};

/** @deprecated Use splitMultiValues — kept as alias for readability at call sites. */
export const splitByPipe = splitMultiValues;

/** Keep first occurrence casing; later case-variants are dropped. */
export const uniqueIgnoreCase = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeValue(value);
    if (!normalized) continue;

    const key = toLookupKey(normalized);
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(normalized);
  }

  return result;
};

/**
 * Merge imported values into an existing array.
 * Existing casing wins; new values keep their imported casing.
 */
export const mergeArrayValues = (
  existing: string[] | null | undefined,
  incoming: string[],
): { merged: string[]; added: string[]; skipped: string[] } => {
  const merged = [...(existing ?? [])].map((value) => normalizeValue(value)).filter(Boolean);
  const seen = new Set(merged.map(toLookupKey));
  const added: string[] = [];
  const skipped: string[] = [];

  for (const value of uniqueIgnoreCase(incoming)) {
    const key = toLookupKey(value);
    if (seen.has(key)) {
      skipped.push(value);
      continue;
    }
    seen.add(key);
    merged.push(value);
    added.push(value);
  }

  return { merged, added, skipped };
};

const HEADER_OR_INSTRUCTION_KEYS = new Set([
  'health concerns',
  'cf_preference',
  'cf preference',
  'cf_formulation / product form',
  'cf formulation / product form',
  'cf_formulation',
  'cf formulation',
  'preference',
  'formulation',
]);

export const isSkippableSheetRow = (raw: string): boolean => {
  const normalized = normalizeValue(raw);
  if (!normalized) return true;

  const key = toLookupKey(normalized);
  if (HEADER_OR_INSTRUCTION_KEYS.has(key)) return true;

  // Preference sheet instruction row: "/ means single preference | means 2 different preference"
  if (key.includes('means single') || key.includes('means 2 different')) return true;

  return false;
};

export const cellText = (cell: ExcelJS.Cell): string => {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return normalizeValue(value);
  }
  if (value instanceof Date) return value.toISOString();
  if ('richText' in value && Array.isArray(value.richText)) {
    return normalizeValue(value.richText.map((part) => part.text ?? '').join(''));
  }
  if ('result' in value && value.result !== undefined && value.result !== null) {
    return normalizeValue(value.result);
  }
  if ('text' in value && typeof value.text === 'string') {
    return normalizeValue(value.text);
  }
  return normalizeValue(cell.text ?? '');
};

/** Read column A values from the first worksheet (or a named sheet). */
export const readFirstColumnValues = async (
  filePath: string,
  sheetName?: string,
): Promise<string[]> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = sheetName
    ? workbook.getWorksheet(sheetName) ?? workbook.worksheets[0]
    : workbook.worksheets[0];

  if (!worksheet) {
    throw new Error(`No worksheet found in ${filePath}`);
  }

  const values: string[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const text = cellText(row.getCell(1));
    if (isSkippableSheetRow(text)) return;
    values.push(text);
  });

  return values;
};

export interface CounterSummary {
  insertedOrAdded: number;
  skipped: number;
}

export interface MasterImportSummary {
  healthConcerns: CounterSummary;
  preference: CounterSummary;
  formulation: CounterSummary;
}

export const printImportSummary = (summary: MasterImportSummary): void => {
  console.log('');
  console.log('========== Import Summary ==========');
  console.log('');
  console.log('Health Concerns');
  console.log(`Inserted : ${summary.healthConcerns.insertedOrAdded}`);
  console.log(`Skipped : ${summary.healthConcerns.skipped}`);
  console.log('');
  console.log('Preference Values');
  console.log(`Added : ${summary.preference.insertedOrAdded}`);
  console.log(`Skipped : ${summary.preference.skipped}`);
  console.log('');
  console.log('Formulation Values');
  console.log(`Added : ${summary.formulation.insertedOrAdded}`);
  console.log(`Skipped : ${summary.formulation.skipped}`);
  console.log('');
  console.log('====================================');
};
