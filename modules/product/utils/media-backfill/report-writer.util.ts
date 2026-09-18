import { createWriteStream, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { MediaReportRow } from './types';

const CSV_HEADERS: (keyof MediaReportRow)[] = [
  'external_product_id',
  'product_ref_id',
  'sku',
  'original_url',
  'rewritten_url',
  'resolved_url',
  'status',
  'http_status',
  'detected_mime',
  'candidate_paths',
  'error_message',
  'gcs_key',
  'timestamp',
];

const escapeCsv = (value: unknown): string => {
  const raw = value == null ? '' : String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
};

export const createReportDir = (baseDir: string): string => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(baseDir, stamp);
  mkdirSync(dir, { recursive: true });
  return dir;
};

export const writeCsvReport = (filePath: string, rows: MediaReportRow[]): void => {
  mkdirSync(dirname(filePath), { recursive: true });
  const lines = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(
      CSV_HEADERS.map((key) => {
        if (key === 'candidate_paths' && Array.isArray((row as any)[key])) {
          return escapeCsv((row as any)[key].join(' | '));
        }
        return escapeCsv(row[key] ?? '');
      }).join(','),
    );
  }
  writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
};

export const writeJsonReport = (filePath: string, data: unknown): void => {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

export const appendCsvRowStreaming = (
  filePath: string,
  row: MediaReportRow,
  wroteHeader: { value: boolean },
): void => {
  mkdirSync(dirname(filePath), { recursive: true });
  const stream = createWriteStream(filePath, { flags: 'a' });
  if (!wroteHeader.value) {
    stream.write(`${CSV_HEADERS.join(',')}\n`);
    wroteHeader.value = true;
  }
  stream.write(
    `${CSV_HEADERS.map((key) => escapeCsv(row[key] ?? '')).join(',')}\n`,
  );
  stream.end();
};

export const rowNow = (
  partial: Omit<MediaReportRow, 'timestamp'> & { timestamp?: string },
): MediaReportRow => ({
  ...partial,
  timestamp: partial.timestamp ?? new Date().toISOString(),
  candidate_paths:
    typeof partial.candidate_paths === 'string'
      ? partial.candidate_paths
      : Array.isArray((partial as any).candidatePaths)
        ? ((partial as any).candidatePaths as string[]).join(' | ')
        : partial.candidate_paths,
});

export type BackfillSummary = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  sheetRows?: number;
  uniqueExternalIds: number;
  databaseMatches: number;
  unmatchedProducts: number;
  eligibleTargets: number;
  exactUrlSuccesses: number;
  manifestFallbackSuccesses: number;
  manualOverrideSuccesses: number;
  ambiguousSources: number;
  missingSources: number;
  malformedUrls: number;
  unsupportedMimeTypes: number;
  uploadFailures: number;
  databaseUpdates: number;
  skippedExisting: number;
  httpErrors: number;
  mode?: string;
  apply: boolean;
  auditOnly: boolean;
};

export type HarvestSummary = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  uniqueUrls: number;
  cached: number;
  pending: number;
  thisRun: number;
  exactUrlSuccesses: number;
  manifestFallbackSuccesses: number;
  manualOverrideSuccesses: number;
  ambiguousSources: number;
  missingSources: number;
  malformedUrls: number;
  unsupportedMimeTypes: number;
  uploadFailures: number;
  skippedCached: number;
  apply: boolean;
};
