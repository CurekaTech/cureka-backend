import { AuditLogChangeEntity } from '../entities/audit-log-change.entity';
import { AuditLogEntity } from '../entities/audit-log.entity';
import { redactAuditDetails, redactAuditValue } from './audit-redact.util';

export type AuditDisplayLabel = { entityName: string | null; actorName: string | null };

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toDatabaseChange(change: AuditLogChangeEntity) {
  return {
    table: change.tableName,
    recordId: change.recordId,
    column: change.columnName,
    field: change.field,
    changeType: change.changeType,
    oldValue: redactAuditValue(change.oldValue),
    newValue: redactAuditValue(change.newValue),
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
  const changedFields = databaseChanges.map((change) => change.field);
  const details = base.details as Record<string, unknown>;
  return {
    ...base,
    requestContext: redactAuditDetails(row.requestContext) ?? null,
    requestPayload: redactAuditDetails(row.requestPayload) ?? null,
    databaseChanges,
    changedFieldsCount: row.changedFieldsCount || databaseChanges.length,
    details: {
      ...details,
      ...(changedFields.length && !Array.isArray(details.fields) ? { fields: changedFields } : {}),
    },
  };
}
