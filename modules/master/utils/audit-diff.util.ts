import { AuditFieldChange } from '../types/audit-capture.types';
import { toColumnName, toJsonValue, valuesEqual } from './audit-json.util';

const SKIP_FIELDS = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
  'deletedAt',
  'changes',
]);

const MAX_CHANGES = 200;

export function diffAuditFields(input: {
  table: string;
  recordId: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  changeType?: AuditFieldChange['changeType'];
  columnByField?: Record<string, string>;
}): AuditFieldChange[] {
  const before = input.before ?? {};
  const after = input.after ?? {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: AuditFieldChange[] = [];

  for (const field of keys) {
    if (SKIP_FIELDS.has(field) || field.startsWith('_')) continue;
    const oldValue = toJsonValue(before[field] ?? null);
    const newValue = toJsonValue(after[field] ?? null);
    if (valuesEqual(oldValue, newValue)) continue;
    const changeType =
      input.changeType ??
      (before[field] === undefined ? 'created' : after[field] === undefined ? 'deleted' : 'updated');
    changes.push({
      table: input.table,
      recordId: input.recordId,
      column: input.columnByField?.[field] ?? toColumnName(field),
      field,
      changeType,
      oldValue,
      newValue,
    });
    if (changes.length >= MAX_CHANGES) break;
  }

  return changes;
}

export function mergeAuditChanges(...groups: AuditFieldChange[][]): AuditFieldChange[] {
  const seen = new Set<string>();
  const merged: AuditFieldChange[] = [];
  for (const group of groups) {
    for (const change of group) {
      const key = `${change.table}:${change.recordId ?? ''}:${change.field}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(change);
      if (merged.length >= MAX_CHANGES) return merged;
    }
  }
  return merged;
}
