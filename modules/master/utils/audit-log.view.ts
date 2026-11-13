import { AuditLogChangeEntity } from '../entities/audit-log-change.entity';
import { AuditLogEntity } from '../entities/audit-log.entity';
import { redactAuditDetails, redactAuditValue } from './audit-redact.util';

export type AuditDisplayLabel = { entityName: string | null; actorName: string | null };

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function snakeToField(column: string): string {
  return column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function toDatabaseChange(change: AuditLogChangeEntity) {
  return {
    table: change.tableName,
    tableName: change.tableName,
    recordId: change.recordId,
    column: change.columnName,
    field: change.field && change.field.includes('_') ? snakeToField(change.field) : change.field,
    changeType: change.changeType,
    operation: change.operation ?? change.changeType,
    oldValue: redactAuditValue(change.oldValue),
    newValue: redactAuditValue(change.newValue),
    before: redactAuditValue(change.oldValue),
    after: redactAuditValue(change.newValue),
  };
}

export function groupDatabaseChanges(changes: ReturnType<typeof toDatabaseChange>[]) {
  const groups = new Map<
    string,
    {
      tableName: string;
      recordId: string | null;
      operation: string;
      fields: Array<{ field: string; column: string; before: unknown; after: unknown; changeType: string }>;
    }
  >();
  for (const change of changes) {
    const key = `${change.tableName}:${change.recordId ?? ''}:${change.operation ?? ''}`;
    const group = groups.get(key) ?? {
      tableName: change.tableName,
      recordId: change.recordId,
      operation: change.operation ?? change.changeType,
      fields: [],
    };
    group.fields.push({
      field: change.field,
      column: change.column,
      before: change.before,
      after: change.after,
      changeType: change.changeType,
    });
    groups.set(key, group);
  }
  return [...groups.values()];
}

function changeSummary(groups: ReturnType<typeof groupDatabaseChanges>) {
  const tables = new Set(groups.map((group) => group.tableName));
  const records = new Set(groups.map((group) => `${group.tableName}:${group.recordId ?? ''}`));
  return {
    totalTables: tables.size,
    totalRecords: records.size,
    totalFieldsChanged: groups.reduce((sum, group) => sum + group.fields.length, 0),
  };
}

function baseView(row: AuditLogEntity, lookedUp?: AuditDisplayLabel) {
  const stored = redactAuditDetails(row.details) ?? {};
  const entityName = text(stored.subjectName) ?? lookedUp?.entityName ?? null;
  const actorName = lookedUp?.actorName ?? null;
  const subjectLabel =
    text(stored.subjectLabel) ?? ([entityName, row.entityRefId].filter(Boolean).join(' · ') || null);
  const actorLabel = actorName && row.performedBy ? `${actorName} · ${row.performedBy}` : (actorName ?? row.performedBy);
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    entityRefId: row.entityRefId,
    entityName,
    subjectLabel,
    action: row.action,
    performedBy: row.performedBy,
    actorType: row.actorType,
    actorId: row.actorId,
    actorName,
    actorLabel,
    ipAddress: row.ipAddress,
    requestId: row.requestId,
    batchId: row.batchId ?? null,
    reliability: row.reliability,
    captureStatus: row.captureStatus ?? null,
    changedFieldsCount: row.changedFieldsCount ?? 0,
    details: {
      ...stored,
      ...(entityName ? { subjectName: entityName } : {}),
      ...(row.entityId ? { subjectId: row.entityId } : {}),
      ...(row.entityRefId ? { subjectRefId: row.entityRefId } : {}),
      ...(subjectLabel ? { subjectLabel } : {}),
      ...(actorName ? { actorName } : {}),
      ...(row.actorId ? { actorId: row.actorId } : {}),
      ...(row.performedBy ? { actorEmail: row.performedBy } : {}),
    },
    createdAt: row.createdAt,
  };
}

export function toAuditListView(row: AuditLogEntity, lookedUp?: AuditDisplayLabel) {
  return baseView(row, lookedUp);
}

export function toAuditDetailView(
  row: AuditLogEntity,
  lookedUp?: AuditDisplayLabel,
  changes: AuditLogChangeEntity[] = [],
) {
  const base = baseView(row, lookedUp);
  const databaseChanges = changes.map(toDatabaseChange);
  const grouped = groupDatabaseChanges(databaseChanges);
  const summary = changeSummary(grouped);
  const changedFields = databaseChanges.map((change) => change.field);
  const details = base.details as Record<string, unknown>;
  return {
    ...base,
    requestContext: redactAuditDetails(row.requestContext) ?? null,
    requestPayload: redactAuditDetails(row.requestPayload) ?? null,
    databaseChanges,
    databaseChangeGroups: grouped,
    changeSummary: summary,
    changedFieldsCount: summary.totalFieldsChanged || row.changedFieldsCount || 0,
    details: {
      ...details,
      ...(changedFields.length && !Array.isArray(details.fields) ? { fields: changedFields } : {}),
    },
  };
}
