import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLogEntity } from '../entities/audit-log.entity';
import {
  AuditLogsRepository,
  CreateAuditLogInput,
} from '../repositories/audit-logs.repository';
import { getAuditActor } from '../utils/audit-actor.context';
import { redactAuditDetails } from '../utils/audit-redact.util';

const FORBIDDEN_ENTITY = new Set(['audit_log']);

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
   * Inserts a critical outbox row on the caller's transaction.
   * A database error propagates so the business change rolls back.
   * A duplicate idempotency key is a no-op.
   */
  async enqueueCritical(manager: EntityManager, input: CreateAuditLogInput): Promise<void> {
    this.assertAuditable(input);
    const payload = this.decorate(input, 'critical');
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

  async findByEntity(
    entityType: string,
    entityId: string,
    order: 'ASC' | 'DESC' = 'DESC',
  ): Promise<AuditLogEntity[]> {
    return this.auditLogsRepo.findByEntity(entityType, entityId, order);
  }

  private decorate(input: CreateAuditLogInput, reliability: 'best_effort' | 'critical'): CreateAuditLogInput {
    const actor = getAuditActor();
    return {
      ...input,
      entityId: input.entityId ?? null,
      performedBy: input.performedBy,
      actorType: input.actorType ?? actor?.type ?? null,
      actorId: input.actorId ?? actor?.id ?? null,
      ipAddress: input.ipAddress ?? actor?.ipAddress ?? null,
      requestId: input.requestId ?? actor?.requestId ?? null,
      reliability,
      details: redactAuditDetails(input.details ?? null),
    };
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
