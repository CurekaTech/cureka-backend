import { AuditActor } from './audit-actor.context';
import { capJsonObject } from './audit-json.util';
import { redactAuditDetails } from './audit-redact.util';
import {
  AuditCaptureStatus,
  AuditFieldChange,
  AuditRequestContext,
} from '../types/audit-capture.types';

const SKIP_BODY_PATH = /\/(auth|login|otp|password|sessions?)\b/i;

export function resolveAuditSource(actor?: AuditActor, path?: string | null, performedBy?: string): string {
  if (actor?.source) return actor.source;
  const job = actor?.id ?? '';
  const who = performedBy ?? actor?.performedBy ?? '';
  if (actor?.type === 'SYSTEM' || who.startsWith('system:') || who.startsWith('system-')) {
    if (job.includes('bulk') || who.includes('bulk') || actor?.batchId) return 'bulk_upload';
    return 'system';
  }
  const route = path ?? actor?.path ?? '';
  if (route.includes('bulk-upload')) return 'bulk_upload';
  if (actor?.type === 'USER') return 'user_api';
  if (actor?.type === 'ADMIN') return 'admin_api';
  return 'unknown';
}

export function buildRequestContext(
  actor?: AuditActor,
  extras?: Partial<AuditRequestContext> | null,
): AuditRequestContext {
  const path = extras?.path ?? actor?.path ?? null;
  const requestId = extras?.requestId ?? actor?.requestId ?? null;
  const batchId = extras?.batchId ?? actor?.batchId ?? null;
  return {
    source: extras?.source ?? resolveAuditSource(actor, path),
    method: extras?.method ?? actor?.method ?? null,
    path,
    requestId,
    batchId,
  };
}

export function sanitizeRequestPayload(
  payload: unknown,
  path?: string | null,
): Record<string, unknown> | null {
  if (payload == null) return null;
  if (path && SKIP_BODY_PATH.test(path)) return null;
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    return capJsonObject({ value: payload as never });
  }
  return capJsonObject(redactAuditDetails(payload as Record<string, unknown>));
}

export function resolveCaptureStatus(input: {
  requestPayload: Record<string, unknown> | null;
  databaseChanges: AuditFieldChange[];
}): AuditCaptureStatus {
  const hasPayload = Boolean(input.requestPayload && Object.keys(input.requestPayload).length);
  const hasChanges = input.databaseChanges.length > 0;
  if (hasPayload && hasChanges) return 'captured';
  if (hasPayload || hasChanges) return 'partial';
  return 'skipped';
}
