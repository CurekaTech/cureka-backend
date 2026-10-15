export interface ICommerceRowError {
  rowNumber: number;
  sku: string;
  column: string;
  invalidValue: string;
  reason: string;
  suggestedFix: string;
}

export interface ICommerceJobSummary {
  type: 'jobSummary';
  variantsUpdated: number;
  productCodFlagsUpdated: number;
  productReturnRecordsUpdated: number;
  variantsAlreadyCompliant: number;
  productsSkippedPartialCodCoverage: number;
  productsSkippedConflictingCodValues: number;
  conflictingReturnRowsRejected: number;
  databaseFailures: number;
  cacheInvalidationFailures: number;
  cacheFailureProductRefIds: string[];
  identicalDuplicateRows: number;
}

export interface IReturnWrite {
  returnAllowed: boolean;
  returnPolicy: string | null;
  returnWindowDays: number | null;
  replaceAllowed: boolean;
  replaceWindowDays: number | null;
  refundAllowed: boolean;
}

export function emptyCommerceJobSummary(): ICommerceJobSummary {
  return {
    type: 'jobSummary',
    variantsUpdated: 0,
    productCodFlagsUpdated: 0,
    productReturnRecordsUpdated: 0,
    variantsAlreadyCompliant: 0,
    productsSkippedPartialCodCoverage: 0,
    productsSkippedConflictingCodValues: 0,
    conflictingReturnRowsRejected: 0,
    databaseFailures: 0,
    cacheInvalidationFailures: 0,
    cacheFailureProductRefIds: [],
    identicalDuplicateRows: 0,
  };
}

/** Accepts true/false and yes/no, case-insensitively. Anything else is invalid. */
export function parseSheetBoolean(raw: string): boolean | null {
  const value = raw.trim().toLowerCase();
  if (value === 'true' || value === 'yes') return true;
  if (value === 'false' || value === 'no') return false;
  return null;
}

/** Empty is allowed. Any other value must be a non-negative integer. */
export function parseOptionalNonNegativeInt(raw: string): number | null | 'invalid' {
  const value = raw.trim();
  if (!value) return null;
  if (!/^\d+$/.test(value)) return 'invalid';
  return Number(value);
}

export function normalizeReturnWrite(input: {
  returnAllowed: boolean;
  returnPolicy: string | null;
  returnWindowDays: number | null;
  replaceAllowed: boolean;
  replaceWindowDays: number | null;
  refundAllowed: boolean;
}): IReturnWrite {
  return {
    returnAllowed: input.returnAllowed,
    returnPolicy: input.returnAllowed ? input.returnPolicy?.trim() || null : null,
    returnWindowDays: input.returnAllowed ? input.returnWindowDays : null,
    replaceAllowed: input.replaceAllowed,
    replaceWindowDays: input.replaceAllowed ? input.replaceWindowDays : null,
    refundAllowed: input.refundAllowed,
  };
}

export function returnWriteKey(value: IReturnWrite): string {
  return JSON.stringify(value);
}

export function sameReturnWrite(
  current: {
    returnAllowed: boolean;
    returnPolicy: string | null;
    returnWindowDays: number | null;
    replaceAllowed: boolean;
    replaceWindowDays: number | null;
    refundAllowed: boolean | null;
  },
  next: IReturnWrite,
): boolean {
  return (
    current.returnAllowed === next.returnAllowed &&
    (current.returnPolicy ?? null) === next.returnPolicy &&
    (current.returnWindowDays ?? null) === next.returnWindowDays &&
    current.replaceAllowed === next.replaceAllowed &&
    (current.replaceWindowDays ?? null) === next.replaceWindowDays &&
    (current.refundAllowed ?? null) === next.refundAllowed
  );
}

export function collapseIdenticalSkuRows<T>(
  rows: T[],
  skuOf: (row: T) => string,
  same: (left: T, right: T) => boolean,
): { rows: T[]; identicalDuplicateRows: number; conflicts: T[] } {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const sku = skuOf(row);
    const group = groups.get(sku);
    if (group) group.push(row);
    else groups.set(sku, [row]);
  }

  const kept: T[] = [];
  const conflicts: T[] = [];
  let identicalDuplicateRows = 0;

  for (const group of groups.values()) {
    const first = group[0];
    if (group.every((row) => same(first, row))) {
      kept.push(first);
      identicalDuplicateRows += group.length - 1;
    } else {
      conflicts.push(...group);
    }
  }

  return { rows: kept, identicalDuplicateRows, conflicts };
}

export type CodProductSyncDecision = 'sync' | 'partial' | 'conflict';

export function decideCodProductSync(
  allVariantIds: string[],
  included: Array<{ variantId: string; codAvailable: boolean }>,
): { decision: CodProductSyncDecision; value?: boolean } {
  const includedIds = new Set(included.map((row) => row.variantId));
  const coversAll =
    allVariantIds.length > 0 && allVariantIds.every((id) => includedIds.has(id));
  if (!coversAll) return { decision: 'partial' };

  const values = new Set(included.map((row) => row.codAvailable));
  if (values.size !== 1) return { decision: 'conflict' };
  return { decision: 'sync', value: included[0].codAvailable };
}
