import { toAuditDetailView, toAuditListView } from './audit-log.view';
import { AuditLogEntity } from '../entities/audit-log.entity';
import { AuditLogChangeEntity } from '../entities/audit-log-change.entity';

function row(overrides: Partial<AuditLogEntity> = {}): AuditLogEntity {
  return {
    id: '36fe7310-5cc3-4ba4-bfeb-f112dd6d52ba',
    entityType: 'product',
    entityId: '2f3207cc-10df-4a0f-b143-52a185a83da4',
    entityRefId: 'TES2026054554',
    action: 'updated',
    performedBy: 'system-bulk-upload',
    actorType: 'SYSTEM',
    actorId: 'bulk-upload',
    ipAddress: null,
    requestId: 'req-example-123',
    idempotencyKey: null,
    reliability: 'best_effort',
    details: { fromStatus: 'pending_review', toStatus: 'pending_review' },
    batchId: 'batch-example-456',
    captureStatus: 'captured',
    requestContext: {
      source: 'bulk_upload',
      method: 'POST',
      path: '/admin/products/bulk-upload',
      requestId: 'req-example-123',
      batchId: 'batch-example-456',
    },
    requestPayload: { name: 'Test Age Image Updated', slug: 'test-age-image-updated' },
    changedFieldsCount: 2,
    createdAt: new Date('2026-11-12T12:38:47.667Z'),
    ...overrides,
  } as AuditLogEntity;
}

describe('audit log views', () => {
  it('keeps list rows compact', () => {
    const view = toAuditListView(row());
    expect(view).toMatchObject({
      id: '36fe7310-5cc3-4ba4-bfeb-f112dd6d52ba',
      batchId: 'batch-example-456',
      captureStatus: 'captured',
      changedFieldsCount: 2,
    });
    expect(view).not.toHaveProperty('requestPayload');
    expect(view).not.toHaveProperty('databaseChanges');
  });

  it('returns payload and field diffs on detail', () => {
    const change = {
      tableName: 'products',
      recordId: '2f3207cc-10df-4a0f-b143-52a185a83da4',
      columnName: 'name',
      field: 'name',
      changeType: 'updated',
      operation: 'UPDATE',
      oldValue: 'Test Age Image kfnk',
      newValue: 'Test Age Image Updated',
    } as AuditLogChangeEntity;
    const view = toAuditDetailView(row(), undefined, [change]);
    expect(view.requestPayload).toEqual({ name: 'Test Age Image Updated', slug: 'test-age-image-updated' });
    expect(view.databaseChanges).toEqual([
      expect.objectContaining({
        table: 'products',
        tableName: 'products',
        recordId: '2f3207cc-10df-4a0f-b143-52a185a83da4',
        column: 'name',
        field: 'name',
        changeType: 'updated',
        oldValue: 'Test Age Image kfnk',
        newValue: 'Test Age Image Updated',
        before: 'Test Age Image kfnk',
        after: 'Test Age Image Updated',
      }),
    ]);
    expect(view.changedFieldsCount).toBe(1);
    expect(view.changeSummary).toEqual({
      totalTables: 1,
      totalRecords: 1,
      totalFieldsChanged: 1,
    });
    expect(view.databaseChangeGroups).toEqual([
      expect.objectContaining({
        tableName: 'products',
        fields: [
          expect.objectContaining({
            field: 'name',
            before: 'Test Age Image kfnk',
            after: 'Test Age Image Updated',
          }),
        ],
      }),
    ]);
  });
});
