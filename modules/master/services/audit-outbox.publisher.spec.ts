import {
  AUDIT_OUTBOX_MAX_ATTEMPTS,
  AuditOutboxRow,
  AuditOutboxStore,
  publishClaimedBatch,
} from './audit-outbox.publisher';

class MemoryOutbox implements AuditOutboxStore {
  rows: Array<AuditOutboxRow & { status: string; deleted?: boolean }> = [];
  audits: string[] = [];
  failInsert = false;
  failMark = false;

  async claim(): Promise<AuditOutboxRow[]> {
    return this.rows.filter((row) => row.status === 'pending' || row.status === 'publishing');
  }

  async insertAudit(row: AuditOutboxRow): Promise<'inserted' | 'exists'> {
    if (this.failInsert) throw new Error('insert failed');
    if (this.audits.includes(row.idempotencyKey)) return 'exists';
    this.audits.push(row.idempotencyKey);
    return 'inserted';
  }

  async markPublished(id: string): Promise<boolean> {
    if (this.failMark) return false;
    const row = this.rows.find((item) => item.id === id);
    if (!row) return false;
    row.status = 'published';
    return true;
  }

  async reschedule(id: string, _token: string, attempts: number, _next: Date, _error: string, failed: boolean): Promise<void> {
    const row = this.rows.find((item) => item.id === id);
    if (!row) return;
    row.attempts = attempts;
    row.status = failed ? 'failed' : 'pending';
  }

  async listStale(): Promise<Array<{ id: string; status: string }>> {
    return [];
  }

  async deletePublishedBefore(): Promise<number> {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => row.status !== 'published');
    return before - this.rows.length;
  }
}

const row = (id: string): AuditOutboxRow & { status: string } => ({
  id,
  idempotencyKey: `key-${id}`,
  payload: {},
  attempts: 0,
  claimToken: 'claim',
  status: 'pending',
});

describe('audit outbox publisher', () => {
  it('publishes once and removes only published rows', async () => {
    const store = new MemoryOutbox();
    store.rows = [row('1'), { ...row('2'), status: 'failed' }];
    const result = await publishClaimedBatch(store);
    expect(result.published).toBe(1);
    expect(store.audits).toEqual(['key-1']);
    expect(store.rows.map((item) => item.status)).toEqual(['failed']);
  });

  it('keeps the row when the audit insert succeeds but the published mark fails', async () => {
    const store = new MemoryOutbox();
    store.rows = [row('1')];
    store.failMark = true;
    const first = await publishClaimedBatch(store);
    expect(first.published).toBe(0);
    expect(store.audits).toEqual(['key-1']);
    expect(store.rows[0].status).toBe('pending');

    store.failMark = false;
    const second = await publishClaimedBatch(store);
    expect(second.published).toBe(1);
    expect(store.audits).toEqual(['key-1']);
    expect(store.rows).toEqual([]);
  });

  it('retries then keeps a failed critical event', async () => {
    const store = new MemoryOutbox();
    const pending = row('1');
    pending.attempts = AUDIT_OUTBOX_MAX_ATTEMPTS - 1;
    store.rows = [pending];
    store.failInsert = true;
    const result = await publishClaimedBatch(store);
    expect(result.failed).toBe(1);
    expect(store.rows[0].status).toBe('failed');
    expect(store.audits).toEqual([]);
  });
});
