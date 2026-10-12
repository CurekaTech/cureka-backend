export const AUDIT_OUTBOX_MAX_ATTEMPTS = 8;
export const AUDIT_OUTBOX_LEASE_MS = 2 * 60 * 1000;
export const AUDIT_OUTBOX_STALE_MS = 15 * 60 * 1000;
export const AUDIT_OUTBOX_PUBLISHED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuditOutboxRow {
  id: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  attempts: number;
  claimToken: string;
}

export interface AuditOutboxStore {
  claim(limit: number, leaseMs: number): Promise<AuditOutboxRow[]>;
  insertAudit(row: AuditOutboxRow): Promise<'inserted' | 'exists'>;
  markPublished(id: string, claimToken: string): Promise<boolean>;
  reschedule(
    id: string,
    claimToken: string,
    attempts: number,
    nextAttemptAt: Date,
    error: string,
    failed: boolean,
  ): Promise<void>;
  listStale(olderThan: Date): Promise<Array<{ id: string; status: string }>>;
  deletePublishedBefore(before: Date): Promise<number>;
}

export function auditBackoffMs(attempts: number): number {
  return Math.min(60_000 * 2 ** Math.max(attempts - 1, 0), 15 * 60 * 1000);
}

/**
 * TypeORM returns `[rows, affectedCount]` for a Postgres UPDATE or DELETE.
 * SELECT and INSERT return the rows directly.
 */
export function rowsFromPostgresQuery<T>(result: unknown): T[] {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  ) {
    return result[0] as T[];
  }
  return Array.isArray(result) ? (result as T[]) : [];
}

/**
 * Publishes claimed outbox rows. A successful audit insert followed by a failed
 * status update leaves the row claimable again. The next pass sees the existing
 * audit row and only retries the published mark. Pending and failed rows are never deleted.
 */
export async function publishClaimedBatch(
  store: AuditOutboxStore,
  now = new Date(),
): Promise<{ published: number; failed: number; retry: number }> {
  const rows = await store.claim(20, AUDIT_OUTBOX_LEASE_MS);
  let published = 0;
  let failed = 0;
  let retry = 0;

  for (const row of rows) {
    try {
      await store.insertAudit(row);
      const marked = await store.markPublished(row.id, row.claimToken);
      if (marked) {
        published += 1;
        continue;
      }
      const attempts = row.attempts + 1;
      const giveUp = attempts >= AUDIT_OUTBOX_MAX_ATTEMPTS;
      await store.reschedule(
        row.id,
        row.claimToken,
        attempts,
        new Date(now.getTime() + auditBackoffMs(attempts)),
        'audit row inserted but published mark failed',
        giveUp,
      );
      if (giveUp) failed += 1;
      else retry += 1;
    } catch (error) {
      const attempts = row.attempts + 1;
      const giveUp = attempts >= AUDIT_OUTBOX_MAX_ATTEMPTS;
      await store.reschedule(
        row.id,
        row.claimToken,
        attempts,
        new Date(now.getTime() + auditBackoffMs(attempts)),
        error instanceof Error ? error.message : String(error),
        giveUp,
      );
      if (giveUp) failed += 1;
      else retry += 1;
    }
  }

  await store.deletePublishedBefore(new Date(now.getTime() - AUDIT_OUTBOX_PUBLISHED_RETENTION_MS));
  return { published, failed, retry };
}
