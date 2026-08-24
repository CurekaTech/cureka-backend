import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import {
  AuditColumn,
  AuditIssue,
  AuditOutputFormat,
  AuditRecord,
  AuditReportPayload,
  AuditSummaryStats,
  CompareResult,
} from './sitemap-audit.types';

const cellValue = (value: unknown): string | number | boolean => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'YES' : 'NO';
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

const escapeCsv = (value: unknown): string => {
  const text = String(cellValue(value));
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export const createAuditOutputDir = (root = 'reports/sitemap-audit'): string => {
  const stamp = new Date().toISOString().slice(0, 10);
  const dir = path.resolve(process.cwd(), root, stamp);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const writeSummarySheet = (workbook: ExcelJS.Workbook, summary: AuditSummaryStats): void => {
  const sheet = workbook.addWorksheet('Summary');
  const rows: Array<[string, string | number]> = [
    ['Sitemap Type', summary.sitemapType],
    ['Base URL', summary.baseUrl],
    ['Report Generated At', summary.reportGeneratedAt],
    ['Total DB Records', summary.totalDbRecords],
    ['Non-deleted Records', summary.nonDeletedRecords],
    ['Eligible Records', summary.eligibleRecords],
    ['Excluded Records', summary.excludedRecords],
    ['Generated URLs', summary.generatedUrls],
    ['Missing Ref ID', summary.missingRefId],
    ['Missing Slug', summary.missingSlug],
    ['Duplicate Ref ID', summary.duplicateRefId],
    ['Duplicate Slug', summary.duplicateSlug],
    ['Duplicate URL', summary.duplicateUrl],
    ['Invalid URL', summary.invalidUrl],
    ['Soft Deleted', summary.softDeleted],
    ['Inactive / Non-published', summary.inactive],
    ['Not Eligible', summary.notEligible],
  ];
  sheet.addRow(['Field', 'Value']);
  for (const row of rows) sheet.addRow(row);
  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 60;
};

const writeRecordsSheet = (
  workbook: ExcelJS.Workbook,
  columns: AuditColumn[],
  records: AuditRecord[],
): void => {
  const sheet = workbook.addWorksheet('Records');
  sheet.addRow(columns.map((column) => column.header));
  for (const record of records) {
    sheet.addRow(columns.map((column) => cellValue(record[column.key])));
  }
  columns.forEach((_, index) => {
    sheet.getColumn(index + 1).width = Math.min(48, Math.max(14, columns[index].header.length + 4));
  });
};

const writeIssuesSheet = (workbook: ExcelJS.Workbook, issues: AuditIssue[]): void => {
  const sheet = workbook.addWorksheet('Data Issues');
  sheet.addRow(['Issue Type', 'Ref ID', 'Name', 'Slug', 'URL', 'Reason']);
  for (const issue of issues) {
    sheet.addRow([
      issue.issueType,
      issue.refId ?? '',
      issue.name ?? '',
      issue.slug ?? '',
      issue.url ?? '',
      issue.reason,
    ]);
  }
  for (let index = 1; index <= 6; index += 1) {
    sheet.getColumn(index).width = index === 6 || index === 5 ? 48 : 20;
  }
};

export const writeAuditCsv = async (
  filePath: string,
  columns: AuditColumn[],
  records: AuditRecord[],
): Promise<void> => {
  const lines = [
    columns.map((column) => escapeCsv(column.header)).join(','),
    ...records.map((record) =>
      columns.map((column) => escapeCsv(record[column.key])).join(','),
    ),
  ];
  await fs.promises.writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
};

export const writeAuditXlsx = async (
  filePath: string,
  payload: AuditReportPayload,
): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Cureka Sitemap Audit';
  writeSummarySheet(workbook, payload.summary);
  writeRecordsSheet(workbook, payload.columns, payload.records);
  writeIssuesSheet(workbook, payload.issues);
  await workbook.xlsx.writeFile(filePath);
};

export const writeAuditReports = async (options: {
  outDir: string;
  format: AuditOutputFormat;
  payload: AuditReportPayload;
}): Promise<string[]> => {
  const outputs: string[] = [];
  const baseName = `${options.payload.type}-audit`;
  if (options.format === 'xlsx' || options.format === 'both') {
    const filePath = path.join(options.outDir, `${baseName}.xlsx`);
    await writeAuditXlsx(filePath, options.payload);
    outputs.push(filePath);
  }
  if (options.format === 'csv' || options.format === 'both') {
    const filePath = path.join(options.outDir, `${baseName}.csv`);
    await writeAuditCsv(filePath, options.payload.columns, options.payload.records);
    outputs.push(filePath);
  }
  return outputs;
};

export const writeAllSummaryXlsx = async (
  filePath: string,
  rows: AuditSummaryStats[],
): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Summary');
  sheet.addRow([
    'Sitemap',
    'DB Records',
    'Eligible Records',
    'Excluded Records',
    'Generated URLs',
    'Duplicate URLs',
    'Data Issues',
  ]);
  for (const row of rows) {
    const issueTotal =
      row.missingRefId +
      row.missingSlug +
      row.duplicateRefId +
      row.duplicateSlug +
      row.duplicateUrl +
      row.invalidUrl +
      row.softDeleted +
      row.inactive +
      row.notEligible;
    sheet.addRow([
      row.sitemapType,
      row.totalDbRecords,
      row.eligibleRecords,
      row.excludedRecords,
      row.generatedUrls,
      row.duplicateUrl,
      issueTotal,
    ]);
  }
  for (let index = 1; index <= 7; index += 1) sheet.getColumn(index).width = 18;
  await workbook.xlsx.writeFile(filePath);
};

export const writeCompareXlsx = async (
  filePath: string,
  result: CompareResult,
): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet('Summary');
  summary.addRow(['Field', 'Value']);
  summary.addRow(['Sitemap Type', result.type]);
  summary.addRow(['Eligible Count', result.eligibleCount]);
  summary.addRow(['Live Sitemap Locs', result.liveCount]);
  summary.addRow(['Matching', result.matching.length]);
  summary.addRow(['Missing From Sitemap', result.missingFromSitemap.length]);
  summary.addRow(['Extra In Sitemap', result.extraInSitemap.length]);
  summary.addRow(['Duplicate In Sitemap', result.duplicateInSitemap.length]);

  const addUrlSheet = (name: string, urls: string[]): void => {
    const sheet = workbook.addWorksheet(name);
    sheet.addRow(['URL']);
    for (const url of urls) sheet.addRow([url]);
    sheet.getColumn(1).width = 80;
  };

  addUrlSheet('Matching', result.matching);
  addUrlSheet('Missing From Sitemap', result.missingFromSitemap);
  addUrlSheet('Extra In Sitemap', result.extraInSitemap);
  addUrlSheet('Duplicate In Sitemap', result.duplicateInSitemap);
  await workbook.xlsx.writeFile(filePath);
};
