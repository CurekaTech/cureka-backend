/**
 * Patch URL column in the above-the-fold Excel workbook (26 known slug fixes).
 *
 * Usage:
 *   npm run category:above-the-fold:fix-urls
 *   npm run category:above-the-fold:fix-urls -- --file="docs/..." --dry-run
 */
import * as ExcelJS from 'exceljs';
import { copyFileSync, existsSync } from 'fs';
import { isAbsolute, resolve } from 'path';
import { CATEGORY_ABOVE_THE_FOLD_URL_PATH_FIXES } from './category-above-the-fold-url-fixes';

const DEFAULT_FILE =
  'docs/Master-Data-Sheets/cureka_category_page_descriptions_above the fold.xlsx';

const absolutePath = (p: string): string =>
  isAbsolute(p) ? p : resolve(process.cwd(), p);

const normalizeText = (cell: ExcelJS.Cell): string => {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object' && 'hyperlink' in v) {
    const link = v as ExcelJS.CellHyperlinkValue;
    return String(link.hyperlink ?? link.text ?? '').trim();
  }
  if (typeof v === 'object' && 'richText' in v) {
    return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('').trim();
  }
  if (typeof v === 'object' && 'text' in v) {
    return String((v as { text: string }).text).trim();
  }
  return String(v).trim();
};

const extractPathKey = (url: string): string | null => {
  const trimmed = url.trim();
  if (!trimmed) return null;
  let pathname = trimmed;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      pathname = new URL(trimmed).pathname;
    } else {
      pathname = trimmed.split(/[?#]/)[0] ?? trimmed;
    }
  } catch {
    return null;
  }
  const match = pathname.replace(/\/+$/, '').match(/\/(?:product-category|categories)\/(.+)$/i);
  if (!match?.[1]) return null;
  return match[1]
    .split('/')
    .map((part) => decodeURIComponent(part).trim().toLowerCase())
    .filter(Boolean)
    .join('/');
};

const rebuildUrl = (url: string, newPathKey: string): string => {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const parsed = new URL(trimmed);
    const prefix = parsed.pathname.replace(/\/(?:product-category|categories)\/.*$/i, '');
    parsed.pathname = `${prefix}/product-category/${newPathKey}`;
    return parsed.toString();
  }
  return `/product-category/${newPathKey}`;
};

const detectUrlColumn = (worksheet: ExcelJS.Worksheet): number => {
  let urlCol = 0;
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = normalizeText(cell).toLowerCase().replace(/\s+/g, ' ').trim();
    if (header === 'url list' || header === 'url' || header === 'links' || header === 'link') {
      urlCol = colNumber;
    }
  });
  return urlCol;
};

const fixMap = new Map(
  CATEGORY_ABOVE_THE_FOLD_URL_PATH_FIXES.map((fix) => [
    fix.from.toLowerCase(),
    fix.to.toLowerCase(),
  ]),
);

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fileArg = args.find((a) => a.startsWith('--file='));
  const filePath = absolutePath(
    fileArg ? fileArg.split('=').slice(1).join('=') : DEFAULT_FILE,
  );

  console.log(`[fix-urls] file=${filePath} dryRun=${dryRun}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  let updated = 0;
  let unchanged = 0;

  for (const worksheet of workbook.worksheets) {
    const urlCol = detectUrlColumn(worksheet);
    if (!urlCol) continue;

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      const cell = worksheet.getRow(rowNumber).getCell(urlCol);
      const current = normalizeText(cell);
      if (!current) continue;

      const pathKey = extractPathKey(current);
      if (!pathKey) continue;

      const replacement = fixMap.get(pathKey);
      if (!replacement) {
        unchanged += 1;
        continue;
      }

      const nextUrl = rebuildUrl(current, replacement);
      if (nextUrl === current) continue;

      console.log(
        `[fix-urls] ${worksheet.name} row ${rowNumber}: ${pathKey} → ${replacement}`,
      );

      if (!dryRun) {
        cell.value = nextUrl;
      }
      updated += 1;
    }
  }

  if (!dryRun && updated > 0) {
    const backupPath = `${filePath}.bak`;
    if (!existsSync(backupPath)) {
      copyFileSync(filePath, backupPath);
      console.log(`[fix-urls] backup saved: ${backupPath}`);
    }
    await workbook.xlsx.writeFile(filePath);
    console.log(`[fix-urls] wrote ${updated} URL updates to workbook`);
  } else if (dryRun) {
    console.log(`[fix-urls] dry-run would update ${updated} cells`);
  } else {
    console.log('[fix-urls] no URL changes needed');
  }

  console.log(`[fix-urls] summary updated=${updated} unchanged=${unchanged}`);
}

run().catch((error) => {
  console.error('[fix-urls] fatal', error);
  process.exit(1);
});
