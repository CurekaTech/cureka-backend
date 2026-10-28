/**
 * Read-only CSV Unicode audit. Never connects to a database.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register apps/api/database/scripts/audit-text-corruption-csv.runner.ts \
 *     --csv="/absolute/path/bulk-export-products (8).csv" \
 *     --out=docs/text-corruption/reports
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { isAbsolute, resolve } from 'path';
import { auditCsvText } from './text-corruption-csv-audit';
import { formatCsvRow } from '@modules/product/utils/bulk-upload-csv.util';

function argValue(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

function writeCsv(path: string, headers: string[], rows: string[][]): void {
  const lines = [formatCsvRow(headers), ...rows.map((row) => formatCsvRow(row))];
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

function main(): void {
  const argv = process.argv.slice(2);
  const csvArg = argValue(argv, 'csv');
  const outArg = argValue(argv, 'out') ?? 'docs/text-corruption/reports';
  if (!csvArg) {
    throw new Error('Pass --csv=/absolute/path/to/bulk-export-products.csv');
  }
  if (!isAbsolute(csvArg)) {
    throw new Error('--csv must be an absolute path.');
  }
  const outDir = resolve(outArg);
  mkdirSync(outDir, { recursive: true });

  const text = readFileSync(csvArg, 'utf8');
  const result = auditCsvText(text, csvArg);
  writeFileSync(`${outDir}/audit-summary.json`, `${JSON.stringify(result.summary, null, 2)}\n`);
  writeFileSync(
    `${outDir}/repair-manifest.json`,
    `${JSON.stringify(
      result.findings.filter((item) => item.status === 'SAFE_AUTO_REPAIR'),
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    `${outDir}/unresolved-report.json`,
    `${JSON.stringify(
      result.findings.filter((item) => item.status !== 'SAFE_AUTO_REPAIR'),
      null,
      2,
    )}\n`,
  );
  writeCsv(
    `${outDir}/flagged-cells.csv`,
    [
      'csv_row',
      'sku',
      'product_id',
      'product_name',
      'column',
      'status',
      'category',
      'fragment',
      'code_points',
      'suggested',
      'confidence',
      'reason',
    ],
    result.findings.map((item) => [
      String(item.csvRow),
      item.sku,
      item.productId,
      item.productName,
      item.column,
      item.status,
      item.category,
      item.fragment,
      item.codePoints,
      item.suggested ?? '',
      item.confidence,
      item.reason,
    ]),
  );
  writeCsv(
    `${outDir}/unicode-inventory.csv`,
    ['character', 'code_point', 'count', 'allowed'],
    result.inventory.map((item) => [
      item.character,
      item.codePoint,
      String(item.count),
      item.allowed ? 'yes' : 'no',
    ]),
  );
  console.log(JSON.stringify(result.summary, null, 2));
  console.log(`[csv-audit] wrote reports under ${outDir}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[csv-audit] failed:', message);
    process.exitCode = 1;
  }
}
