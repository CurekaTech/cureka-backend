import {
  CellFinding,
  FindingStatus,
  codePointsOf,
  hasForbiddenCorruption,
} from './text-corruption-policy';
import {
  cleanJson,
  findReviewOnlyFragments,
  findUnresolved,
  repairText,
  type UnresolvedFragment,
} from './text-corruption-repair';

export type UnicodeInventoryRow = {
  character: string;
  codePoint: string;
  count: number;
  allowed: boolean;
};

export type CsvAuditSummary = {
  sourcePath: string;
  productRecords: number;
  columns: number;
  cellsInspected: number;
  flaggedCells: number;
  affectedProductRows: number;
  findings: number;
  byStatus: Record<FindingStatus, number>;
  byCategory: Record<string, number>;
  distinctNonAscii: number;
  autoRepairableCells: number;
  manualReviewCells: number;
  sourceRequiredCells: number;
};

export type CsvAuditResult = {
  summary: CsvAuditSummary;
  findings: CellFinding[];
  inventory: UnicodeInventoryRow[];
};

const IDENTITY_HEADERS = {
  sku: ['product sku code*', 'product sku code', 'sku', 'variant sku'],
  productId: ['product id (string)', 'product id', 'product uuid'],
  productName: ['product name*', 'product name'],
};

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase();
}

function headerIndex(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeader);
  return aliases.reduce((found, alias) => {
    if (found >= 0) return found;
    return normalized.indexOf(alias);
  }, -1);
}

export function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;

  const pushCell = () => {
    row.push(current);
    current = '';
  };
  const pushRow = () => {
    records.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        current += '"';
        index += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = false;
        continue;
      }
      current += char;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      pushCell();
      continue;
    }
    if (char === '\n') {
      if (current.endsWith('\r')) current = current.slice(0, -1);
      pushCell();
      pushRow();
      continue;
    }
    current += char;
  }
  if (inQuotes) current += '';
  if (current.length || row.length) {
    pushCell();
    pushRow();
  }
  return records.filter((item) => item.some((cell) => cell.length > 0));
}

function maybeParseJson(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[' && trimmed[0] !== '"')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function repairCell(value: string): { original: string; repaired: string; unresolved: UnresolvedFragment[] } {
  const parsed = maybeParseJson(value);
  if (parsed !== value) {
    const repaired = cleanJson(parsed);
    const serialized = JSON.stringify(repaired.value);
    return {
      original: value,
      repaired: serialized === value ? repairText(value).value : serialized,
      unresolved: repaired.unresolved,
    };
  }
  const repaired = repairText(value);
  return { original: value, repaired: repaired.value, unresolved: repaired.unresolved };
}

function statusForReason(reason: string, changed: boolean): FindingStatus {
  if (changed && (reason === 'auto_restored' || reason.startsWith('safe_'))) return 'SAFE_AUTO_REPAIR';
  if (
    reason === 'unrecoverable_replacement_character' ||
    reason === 'incomplete_punctuation_mojibake' ||
    reason === 'c1_control_character' ||
    reason === 'c0_control_character'
  ) {
    return 'SOURCE_REQUIRED';
  }
  if (reason === 'auto_restored') return 'SAFE_AUTO_REPAIR';
  return 'MANUAL_REVIEW';
}

function suggestedFor(reason: string, repaired: string, fragment: string): string | null {
  if (reason === 'auto_restored') return repaired;
  if (reason === 'unrecoverable_replacement_character') return null;
  if (reason === 'incomplete_punctuation_mojibake') return null;
  if (reason === 'malformed_numeric_expression') return null;
  if (reason === 'ring_above_not_temperature') return fragment.replace(/\u02DA/g, '\u00B0');
  return repaired === fragment ? null : repaired;
}

export function classifyCell(args: {
  csvRow: number;
  sku: string;
  productId: string;
  productName: string;
  column: string;
  original: string;
}): CellFinding[] {
  const repaired = repairCell(args.original);
  const review = findReviewOnlyFragments(repaired.repaired);
  const leftover = [...repaired.unresolved, ...review, ...findUnresolved(repaired.repaired)];
  const unique = new Map<string, UnresolvedFragment>();
  for (const item of leftover) unique.set(`${item.reason}:${item.fragment}`, item);

  const findings: CellFinding[] = [];
  if (repaired.repaired !== repaired.original) {
    findings.push({
      csvRow: args.csvRow,
      sku: args.sku,
      productId: args.productId,
      productName: args.productName,
      column: args.column,
      original: args.original,
      repaired: repaired.repaired,
      fragment: args.original,
      codePoints: codePointsOf(args.original),
      category: 'safe_auto_repair',
      suggested: repaired.repaired,
      confidence: 'high',
      status: 'SAFE_AUTO_REPAIR',
      reason: 'Deterministic encoding repair or control-strip changed this cell.',
    });
  }
  for (const item of unique.values()) {
    if (repaired.repaired !== repaired.original && item.reason === 'auto_restored') continue;
    const status = statusForReason(item.reason, false);
    findings.push({
      csvRow: args.csvRow,
      sku: args.sku,
      productId: args.productId,
      productName: args.productName,
      column: args.column,
      original: args.original,
      repaired: repaired.repaired,
      fragment: item.fragment,
      codePoints: codePointsOf(item.fragment),
      category: item.reason,
      suggested: suggestedFor(item.reason, repaired.repaired, item.fragment),
      confidence: status === 'SOURCE_REQUIRED' ? 'low' : 'medium',
      status,
      reason: item.reason,
    });
  }
  return findings;
}

function countNonAscii(text: string, inventory: Map<number, number>): void {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x7f) continue;
    inventory.set(code, (inventory.get(code) ?? 0) + 1);
  }
}

export function auditCsvText(text: string, sourcePath = '(memory)'): CsvAuditResult {
  const records = parseCsvRecords(text.replace(/^\uFEFF/, ''));
  if (!records.length) {
    return {
      summary: {
        sourcePath,
        productRecords: 0,
        columns: 0,
        cellsInspected: 0,
        flaggedCells: 0,
        affectedProductRows: 0,
        findings: 0,
        byStatus: {
          SAFE_AUTO_REPAIR: 0,
          MANUAL_REVIEW: 0,
          SOURCE_REQUIRED: 0,
          VALID_UNICODE: 0,
          UNSUPPORTED_CHARACTER: 0,
        },
        byCategory: {},
        distinctNonAscii: 0,
        autoRepairableCells: 0,
        manualReviewCells: 0,
        sourceRequiredCells: 0,
      },
      findings: [],
      inventory: [],
    };
  }

  const headers = records[0].map((header) => header.replace(/^\uFEFF/, ''));
  const skuIndex = headerIndex(headers, IDENTITY_HEADERS.sku);
  const productIdIndex = headerIndex(headers, IDENTITY_HEADERS.productId);
  const productNameIndex = headerIndex(headers, IDENTITY_HEADERS.productName);
  const findings: CellFinding[] = [];
  const flaggedCells = new Set<string>();
  const affectedRows = new Set<number>();
  const inventory = new Map<number, number>();
  const byStatus: Record<FindingStatus, number> = {
    SAFE_AUTO_REPAIR: 0,
    MANUAL_REVIEW: 0,
    SOURCE_REQUIRED: 0,
    VALID_UNICODE: 0,
    UNSUPPORTED_CHARACTER: 0,
  };
  const byCategory: Record<string, number> = {};
  const autoRepairableCells = new Set<string>();
  const manualReviewCells = new Set<string>();
  const sourceRequiredCells = new Set<string>();

  for (let rowIndex = 1; rowIndex < records.length; rowIndex += 1) {
    const row = records[rowIndex];
    const csvRow = rowIndex + 1;
    const sku = skuIndex >= 0 ? row[skuIndex] ?? '' : '';
    const productId = productIdIndex >= 0 ? row[productIdIndex] ?? '' : '';
    const productName = productNameIndex >= 0 ? row[productNameIndex] ?? '' : '';
    for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
      const value = row[columnIndex] ?? '';
      countNonAscii(value, inventory);
      if (!value) continue;
      const cellFindings = classifyCell({
        csvRow,
        sku,
        productId,
        productName,
        column: headers[columnIndex] ?? `column_${columnIndex}`,
        original: value,
      });
      if (!cellFindings.length) continue;
      const key = `${csvRow}:${columnIndex}`;
      flaggedCells.add(key);
      affectedRows.add(csvRow);
      for (const finding of cellFindings) {
        findings.push(finding);
        byStatus[finding.status] += 1;
        byCategory[finding.category] = (byCategory[finding.category] ?? 0) + 1;
        if (finding.status === 'SAFE_AUTO_REPAIR') autoRepairableCells.add(key);
        if (finding.status === 'MANUAL_REVIEW') manualReviewCells.add(key);
        if (finding.status === 'SOURCE_REQUIRED') sourceRequiredCells.add(key);
      }
    }
  }

  const inventoryRows: UnicodeInventoryRow[] = [...inventory.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])
    .map(([code, count]) => ({
      character: String.fromCodePoint(code),
      codePoint: `U+${code.toString(16).toUpperCase().padStart(4, '0')}`,
      count,
      allowed: code !== 0xfffd && !(code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) && !(code >= 0x80 && code <= 0x9f),
    }));

  return {
    summary: {
      sourcePath,
      productRecords: records.length - 1,
      columns: headers.length,
      cellsInspected: (records.length - 1) * headers.length,
      flaggedCells: flaggedCells.size,
      affectedProductRows: affectedRows.size,
      findings: findings.length,
      byStatus,
      byCategory,
      distinctNonAscii: inventoryRows.length,
      autoRepairableCells: autoRepairableCells.size,
      manualReviewCells: manualReviewCells.size,
      sourceRequiredCells: sourceRequiredCells.size,
    },
    findings,
    inventory: inventoryRows,
  };
}

export function forbiddenFindings(findings: CellFinding[]): CellFinding[] {
  return findings.filter(
    (item) =>
      item.status === 'SOURCE_REQUIRED' ||
      item.status === 'UNSUPPORTED_CHARACTER' ||
      hasForbiddenCorruption([{ reason: item.category }]),
  );
}
