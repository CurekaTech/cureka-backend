import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLogEntity } from '../entities/audit-log.entity';
import {
  AuditLogsRepository,
  CreateAuditLogInput,
} from '../repositories/audit-logs.repository';
import { getAuditActor } from '../utils/audit-actor.context';
import { mergeAuditSubject } from '../utils/audit-subject.util';
import { auditIdempotency } from '../utils/audit-idempotency.util';
import { redactAuditDetails } from '../utils/audit-redact.util';
import {
  buildRequestContext,
  resolveCaptureStatus,
  sanitizeRequestPayload,
} from '../utils/audit-capture.util';
import { AuditFieldChange } from '../types/audit-capture.types';
import { rowsFromPostgresQuery } from './audit-outbox.publisher';

const FORBIDDEN_ENTITY = new Set(['audit_log']);

function clip(value: string | null | undefined, max: number): string | null {
  if (value == null || value === '') return null;
  return value.length <= max ? value : value.slice(0, max);
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly auditLogsRepo: AuditLogsRepository,
    private readonly dataSource: DataSource,
  ) {}

  /** Best-effort write. Failures are logged and do not fail the caller. */
  async log(input: CreateAuditLogInput): Promise<AuditLogEntity | null> {
    if (FORBIDDEN_ENTITY.has(input.entityType)) {
      this.logger.error(`Refusing to audit entity type ${input.entityType}`);
      return null;
    }
    try {
      return await this.auditLogsRepo.create(this.decorate(input, 'best_effort'));
    } catch (error) {
      if (this.isUniqueViolation(error)) return null;
      this.logger.error(
        `Best-effort audit failed for ${input.entityType}:${input.action}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * Inserts the audit row and a critical outbox row on the caller's transaction.
   * A database error propagates so the business change rolls back.
   * A duplicate idempotency key is a no-op.
   */
  async enqueueCritical(manager: EntityManager, input: CreateAuditLogInput): Promise<void> {
    this.assertAuditable(input);
    const payload = this.decorate(input, 'critical');
    const inserted = rowsFromPostgresQuery<{ id: string }>(
      await manager.query(
      `INSERT INTO "audit_logs" (
         entity_type, entity_id, entity_ref_id, action, performed_by, details,
         actor_type, actor_id, ip_address, request_id, idempotency_key, reliability,
         batch_id, capture_status, request_context, request_payload, changed_fields_count
       ) VALUES (
         $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12,
         $13, $14, $15::jsonb, $16::jsonb, $17
       )
       ON CONFLICT ("idempotency_key") WHERE "idempotency_key" IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        payload.entityType,
        payload.entityId ?? null,
        payload.entityRefId ?? null,
        payload.action,
        payload.performedBy,
        JSON.stringify(payload.details ?? null),
        payload.actorType ?? null,
        payload.actorId ?? null,
        payload.ipAddress ?? null,
        payload.requestId ?? null,
        payload.idempotencyKey,
        'critical',
        payload.batchId ?? null,
        payload.captureStatus ?? null,
        JSON.stringify(payload.requestContext ?? null),
        JSON.stringify(payload.requestPayload ?? null),
        payload.changedFieldsCount ?? 0,
      ],
      ),
    );
    const auditLogId = inserted[0]?.id ? String(inserted[0].id) : null;
    if (auditLogId) {
      const attached = await this.auditLogsRepo.attachPendingChanges(
        manager,
        auditLogId,
        payload.requestId ?? null,
      );
      if (!attached && payload.databaseChanges?.length) {
        await this.insertChanges(manager, auditLogId, payload.databaseChanges);
      }
    }
    await manager.query(
      `INSERT INTO "audit_outbox" ("idempotency_key", "payload", "status", "attempts")
       VALUES ($1, $2::jsonb, 'pending', 0)
       ON CONFLICT ("idempotency_key") DO NOTHING`,
      [payload.idempotencyKey, JSON.stringify(payload)],
    );
  }

  /** Commits a critical outbox row before the caller returns. Throws 503 when it cannot. */
  async persistCritical(input: CreateAuditLogInput): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        await this.enqueueCritical(manager, input);
      });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error(
        `Critical audit persistence failed for ${input.action}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new ServiceUnavailableException('Audit log unavailable');
    }
  }

  /**
   * Best-effort record of a committed write. The actor comes from the verified
   * request context when one exists. `anonymous` is used only when neither the
   * caller nor the request has an identity.
   */
  async recordWrite(input: {
    entityType: string;
    entityId?: string | null;
    entityRefId?: string | null;
    action: string;
    performedBy?: string | null;
    /** Readable name stored beside the id. Not a full entity dump. */
    name?: string | null;
    details?: Record<string, unknown> | null;
    requestPayload?: Record<string, unknown> | null;
    databaseChanges?: AuditFieldChange[] | null;
    batchId?: string | null;
  }): Promise<void> {
    const actor = getAuditActor();
    const performedBy = input.performedBy?.trim() || actor?.performedBy || 'anonymous';
    const subjectId = input.entityId ?? input.entityRefId ?? 'none';
    await this.log({
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      entityRefId: input.entityRefId ?? null,
      action: input.action,
      performedBy,
      actorType: actor?.type ?? null,
      actorId: actor?.id ?? null,
      idempotencyKey: auditIdempotency.write(
        input.entityType,
        subjectId,
        input.action,
        actor?.requestId ?? `${Date.now()}`,
      ),
      details: mergeAuditSubject(input.details, {
        name: input.name,
        id: input.entityId,
        refId: input.entityRefId,
      }),
      requestPayload: input.requestPayload,
      databaseChanges: input.databaseChanges,
      batchId: input.batchId,
    });
  }

  async findByEntity(
    entityType: string,
    entityId: string,
    order: 'ASC' | 'DESC' = 'DESC',
  ): Promise<AuditLogEntity[]> {
    return this.auditLogsRepo.findByEntity(entityType, entityId, order);
  }

  private decorate(
    input: CreateAuditLogInput,
    reliability: 'best_effort' | 'critical',
  ): CreateAuditLogInput {
    const actor = getAuditActor();
    const requestId = clip(input.requestId ?? actor?.requestId ?? null, 64);
    const requestContext = buildRequestContext(actor, {
      ...(input.requestContext ?? {}),
      requestId,
      batchId: input.batchId ?? actor?.batchId ?? null,
    });
    const requestPayload = sanitizeRequestPayload(
      input.requestPayload ?? actor?.requestPayload ?? null,
      requestContext.path,
    );
    const databaseChanges = input.databaseChanges ?? [];
    const captureStatus =
      input.captureStatus ?? resolveCaptureStatus({ requestPayload, databaseChanges });
    return {
      ...input,
      entityId: input.entityId ?? null,
      entityRefId: clip(input.entityRefId ?? null, 64),
      performedBy: clip(input.performedBy, 255) ?? input.performedBy,
      actorType: input.actorType ?? actor?.type ?? null,
      actorId: clip(input.actorId ?? actor?.id ?? null, 255),
      ipAddress: clip(input.ipAddress ?? actor?.ipAddress ?? null, 64),
      requestId,
      batchId: clip(input.batchId ?? actor?.batchId ?? null, 64),
      idempotencyKey: clip(input.idempotencyKey ?? null, 255),
      reliability,
      details: redactAuditDetails(input.details ?? null),
      requestContext: { ...requestContext },
      requestPayload,
      databaseChanges,
      changedFieldsCount: databaseChanges.length,
      captureStatus,
    };
  }

  private async insertChanges(
    manager: EntityManager,
    auditLogId: string,
    changes: AuditFieldChange[],
  ): Promise<void> {
    for (const change of changes) {
      await manager.query(
        `INSERT INTO "audit_log_changes" (
           audit_log_id, table_name, record_id, column_name, field, change_type, old_value, new_value
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
        [
          auditLogId,
          change.table,
          change.recordId,
          change.column,
          change.field,
          change.changeType,
          JSON.stringify(change.oldValue ?? null),
          JSON.stringify(change.newValue ?? null),
        ],
      );
    }
  }

  private assertAuditable(input: CreateAuditLogInput): void {
    if (FORBIDDEN_ENTITY.has(input.entityType)) {
      throw new ServiceUnavailableException('Audit log unavailable');
    }
    if (!input.idempotencyKey) {
      throw new ServiceUnavailableException('Audit log unavailable');
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    const driver = error as { code?: string; driverError?: { code?: string } };
    return driver.code === '23505' || driver.driverError?.code === '23505';
  }
}
