import { buildRequestContext, resolveCaptureStatus, sanitizeRequestPayload } from './audit-capture.util';

describe('sanitizeRequestPayload', () => {
  it('redacts secrets and drops auth route bodies', () => {
    expect(sanitizeRequestPayload({ name: 'Serum', password: 'secret' }, '/admin/products')).toEqual({
      name: 'Serum',
      password: '[redacted]',
    });
    expect(sanitizeRequestPayload({ otp: '123456' }, '/auth/login')).toBeNull();
  });
});

describe('buildRequestContext', () => {
  it('marks bulk jobs as bulk_upload', () => {
    expect(
      buildRequestContext({
        type: 'SYSTEM',
        id: 'bulk-upload',
        performedBy: 'system:bulk-upload',
        ipAddress: null,
        requestId: null,
        batchId: 'BUP1',
        path: '/admin/products/bulk-upload',
        source: 'bulk_upload',
      }),
    ).toMatchObject({
      source: 'bulk_upload',
      path: '/admin/products/bulk-upload',
      batchId: 'BUP1',
    });
  });
});

describe('resolveCaptureStatus', () => {
  it('is captured only when payload and field diffs are both present', () => {
    expect(resolveCaptureStatus({ requestPayload: { name: 'A' }, databaseChanges: [] })).toBe('partial');
    expect(
      resolveCaptureStatus({
        requestPayload: { name: 'A' },
        databaseChanges: [
          {
            table: 'products',
            recordId: 'p1',
            column: 'name',
            field: 'name',
            changeType: 'updated',
            oldValue: 'A',
            newValue: 'B',
          },
        ],
      }),
    ).toBe('captured');
  });
});
