import * as ExcelJS from 'exceljs';
import { normalizeValue, toLookupKey, uniqueIgnoreCase } from './master-import.helpers';

export const UPDATED_BY = 'category-master-import';

const HEADER_LABELS = new Set([
  'main category',
  'sub category',
  'sub sub category',
  'sub category ',
  'sub sub category ',
]);

const MAIN_CATEGORY_HEADER = /^main category\s*\d+:\s*(.+)$/i;

export interface CategorySubcategoryRow {
  rootName: string;
  subCategoryNames: string[];
}

export interface SubSubCategoryRow {
  rootName: string;
  subCategoryName: string;
  subSubCategoryNames: string[];
}

export interface CategoryImportCounters {
  inserted: number;
  skipped: number;
  warnings: number;
}

export interface CategoryImportSummary {
  roots: CategoryImportCounters;
  subCategories: CategoryImportCounters;
  subSubCategories: CategoryImportCounters;
}

export const emptyCounters = (): CategoryImportCounters => ({
  inserted: 0,
  skipped: 0,
  warnings: 0,
});

export const siblingCacheKey = (parentId: string | null, name: string): string =>
  `${parentId ?? 'root'}|${toLookupKey(name)}`;

export const generateCategorySlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

export const isSkippableCategoryLabel = (value: string): boolean => {
  const normalized = normalizeValue(value);
  if (!normalized) return true;
  const key = toLookupKey(normalized);
  if (HEADER_LABELS.has(key)) return true;
  if (MAIN_CATEGORY_HEADER.test(normalized)) return true;
  if (key === 'no sub sub category') return true;
  return false;
};

/** Split child category names on comma, newline, or pipe. */
export const splitCategoryList = (raw: string): string[] =>
  uniqueIgnoreCase(
    normalizeValue(raw)
      .split(/[\n,|]+/)
      .map((part) => normalizeValue(part))
      .filter((part) => part && !isSkippableCategoryLabel(part)),
  );

export const parseMainCategoryName = (raw: string): string | null => {
  const normalized = normalizeValue(raw);
  if (!normalized) return null;
  const match = MAIN_CATEGORY_HEADER.exec(normalized);
  if (match?.[1]) {
    return normalizeValue(match[1]);
  }
  return null;
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

const readWorksheet = async (
  filePath: string,
  preferredSheetName?: string,
): Promise<ExcelJS.Worksheet> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = preferredSheetName
    ? workbook.getWorksheet(preferredSheetName) ?? workbook.worksheets[0]
    : workbook.worksheets[0];
  if (!worksheet) {
    throw new Error(`No worksheet found in ${filePath}`);
  }
  return worksheet;
};

/** Sheet 1: Main Category | Sub category (comma/newline separated). */
export const readCategorySubcategorySheet = async (
  filePath: string,
  sheetName?: string,
): Promise<CategorySubcategoryRow[]> => {
  const worksheet = await readWorksheet(filePath, sheetName);
  const rows: CategorySubcategoryRow[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const rootName = normalizeValue(cellText(row.getCell(1)));
    const subRaw = cellText(row.getCell(2));
    if (!rootName || isSkippableCategoryLabel(rootName)) return;

    rows.push({
      rootName,
      subCategoryNames: splitCategoryList(subRaw),
    });
  });

  return rows;
};

/**
 * Sheet 2: grouped by Main Category sections.
 * Col A = Sub category, Col B = Sub Sub categories (comma/newline separated).
 */
export const readSubSubCategorySheet = async (
  filePath: string,
  sheetName?: string,
): Promise<SubSubCategoryRow[]> => {
  const worksheet = await readWorksheet(filePath, sheetName);
  const rows: SubSubCategoryRow[] = [];
  let currentRootName: string | null = null;

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      const headerRoot =
        parseMainCategoryName(cellText(row.getCell(1))) ??
        parseMainCategoryName(cellText(row.getCell(2)));
      if (headerRoot) currentRootName = headerRoot;
      return;
    }

    const colA = normalizeValue(cellText(row.getCell(1)));
    const colB = cellText(row.getCell(2));

    const rootFromA = parseMainCategoryName(colA);
    const rootFromB = parseMainCategoryName(colB);
    if (rootFromA && colA === colB) {
      currentRootName = rootFromA;
      return;
    }
    if (rootFromB && colA === colB) {
      currentRootName = rootFromB;
      return;
    }

    if (!currentRootName) return;
    if (isSkippableCategoryLabel(colA)) return;

    const subSubCategoryNames = splitCategoryList(colB);
    if (!subSubCategoryNames.length) return;

    rows.push({
      rootName: currentRootName,
      subCategoryName: colA,
      subSubCategoryNames,
    });
  });

  return rows;
};

export const printCategoryImportSummary = (summary: CategoryImportSummary): void => {
  console.log('');
  console.log('========== Category Import Summary ==========');
  console.log('');
  console.log('Root Categories');
  console.log(`Inserted : ${summary.roots.inserted}`);
  console.log(`Skipped  : ${summary.roots.skipped}`);
  if (summary.roots.warnings) console.log(`Warnings : ${summary.roots.warnings}`);
  console.log('');
  console.log('Sub Categories');
  console.log(`Inserted : ${summary.subCategories.inserted}`);
  console.log(`Skipped  : ${summary.subCategories.skipped}`);
  if (summary.subCategories.warnings) console.log(`Warnings : ${summary.subCategories.warnings}`);
  console.log('');
  console.log('Sub Sub Categories');
  console.log(`Inserted : ${summary.subSubCategories.inserted}`);
  console.log(`Skipped  : ${summary.subSubCategories.skipped}`);
  if (summary.subSubCategories.warnings) {
    console.log(`Warnings : ${summary.subSubCategories.warnings}`);
  }
  console.log('');
  console.log('============================================');
};
