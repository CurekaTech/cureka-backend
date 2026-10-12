import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { runAsSystem } from '../utils/audit-actor.context';
import {
  AUDIT_OUTBOX_LEASE_MS,
  AUDIT_OUTBOX_STALE_MS,
  AuditOutboxRow,
  AuditOutboxStore,
  publishClaimedBatch,
  rowsFromPostgresQuery,
} from './audit-outbox.publisher';

@Injectable()
export class AuditOutboxWorkerService implements AuditOutboxStore, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditOutboxWorkerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit(): void {
    if ((process.env.AUDIT_OUTBOX_PUBLISHER_ENABLED ?? 'true').toLowerCase() === 'false') return;
    const publish = () => {
      void runAsSystem('audit-outbox-publisher', () => this.publishOnce()).catch((error) => {
        this.logger.error(
          `Audit outbox publish failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    };
    publish();
    this.timer = setInterval(publish, 5000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async publishOnce(): Promise<void> {
    const result = await publishClaimedBatch(this);
    const stale = await this.listStale(new Date(Date.now() - AUDIT_OUTBOX_STALE_MS));
    if (stale.length) {
      this.logger.error(
        `Audit outbox has ${stale.length} stale pending or failed event(s). They are kept for recovery. ids=${stale
          .map((row) => `${row.status}:${row.id}`)
          .join(',')}`,
      );
    }
    if (result.failed) {
      this.logger.error(`Audit outbox moved ${result.failed} event(s) to failed. They were not discarded.`);
    }
  }

  async claim(limit: number, leaseMs = AUDIT_OUTBOX_LEASE_MS): Promise<AuditOutboxRow[]> {
    const claimToken = randomUUID();
    const rows = rowsFromPostgresQuery<Record<string, unknown>>(await this.dataSource.query(
      `WITH claimed AS (
         SELECT id
         FROM audit_outbox
         WHERE (
           status = 'pending'
           AND (next_attempt_at IS NULL OR next_attempt_at <= now())
           AND (locked_at IS NULL OR locked_at < now() - (CAST($2 AS double precision) * interval '1 millisecond'))
         ) OR (
           status = 'publishing'
           AND locked_at < now() - (CAST($2 AS double precision) * interval '1 millisecond')
         )
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $3
       )
       UPDATE audit_outbox AS outbox
       SET status = 'publishing', locked_at = now(), claim_token = $1
       FROM claimed
       WHERE outbox.id = claimed.id
       RETURNING outbox.id, outbox.idempotency_key, outbox.payload, outbox.attempts, outbox.claim_token`,
      [claimToken, leaseMs, limit],
    );
    return rows.map((row) => ({
      id: String(row.id),
      idempotencyKey: String(row.idempotency_key),
      payload: (row.payload ?? {}) as Record<string, unknown>,
      attempts: Number(row.attempts ?? 0),
      claimToken: String(row.claim_token),
    }));
  }

  async insertAudit(row: AuditOutboxRow): Promise<'inserted' | 'exists'> {
    const payload = row.payload;
    const inserted: Array<{ id: string }> = await this.dataSource.query(
      `INSERT INTO audit_logs (
         entity_type, entity_id, entity_ref_id, action, performed_by, details,
         actor_type, actor_id, ip_address, request_id, idempotency_key, reliability
       ) VALUES (
         $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12
       )
       ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
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
        payload.idempotencyKey ?? row.idempotencyKey,
        payload.reliability ?? 'critical',
      ],
    );
    return inserted.length ? 'inserted' : 'exists';
  }

  async markPublished(id: string, claimToken: string): Promise<boolean> {
    const updated = rowsFromPostgresQuery<{ id: string }>(await this.dataSource.query(
      `UPDATE audit_outbox
       SET status = 'published', published_at = now(), locked_at = NULL, claim_token = NULL, last_error = NULL
       WHERE id = $1 AND claim_token = $2
       RETURNING id`,
      [id, claimToken],
    );
    return updated.length > 0;
  }

  async reschedule(
    id: string,
    claimToken: string,
    attempts: number,
    nextAttemptAt: Date,
    error: string,
    failed: boolean,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE audit_outbox
       SET status = $3, attempts = $4, next_attempt_at = $5, last_error = $6, locked_at = NULL, claim_token = NULL
       WHERE id = $1 AND claim_token = $2`,
      [id, claimToken, failed ? 'failed' : 'pending', attempts, nextAttemptAt, error.slice(0, 2000)],
    );
  }

  async listStale(olderThan: Date): Promise<Array<{ id: string; status: string }>> {
    const rows: Array<{ id: string; status: string }> = await this.dataSource.query(
      `SELECT id, status
       FROM audit_outbox
       WHERE (
         status IN ('pending', 'failed') AND created_at < $1
       ) OR (
         status = 'publishing' AND locked_at IS NOT NULL AND locked_at < $1
       )
       ORDER BY created_at
       LIMIT 50`,
      [olderThan],
    );
    return rows;
  }

  async deletePublishedBefore(before: Date): Promise<number> {
    const rows = rowsFromPostgresQuery<{ id: string }>(await this.dataSource.query(
      `DELETE FROM audit_outbox
       WHERE status = 'published' AND published_at IS NOT NULL AND published_at < $1
       RETURNING id`,
      [before],
    );
    return rows.length;
  }
}
