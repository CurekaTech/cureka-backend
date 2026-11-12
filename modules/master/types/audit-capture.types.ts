export type AuditChangeType = 'created' | 'updated' | 'deleted';

export type AuditCaptureStatus = 'captured' | 'partial' | 'skipped';

export interface AuditFieldChange {
  table: string;
  recordId: string | null;
  column: string;
  field: string;
  changeType: AuditChangeType;
  oldValue: unknown;
  newValue: unknown;
}

export interface AuditRequestContext {
  source: string;
  method: string | null;
  path: string | null;
  requestId: string | null;
  batchId: string | null;
  [key: string]: unknown;
}

export interface AuditCaptureInput {
  requestPayload?: Record<string, unknown> | null;
  requestContext?: Partial<AuditRequestContext> | null;
  databaseChanges?: AuditFieldChange[] | null;
  batchId?: string | null;
  captureStatus?: AuditCaptureStatus | null;
}
