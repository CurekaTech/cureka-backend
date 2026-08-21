import { resolveRequestId, resolveOrCreateRequestId, assignIncomingRequestId } from './request-id.util';
import { REQUEST_ID_HEADER, CORRELATION_ID_HEADER } from './logging.constants';

describe('resolveRequestId', () => {
  it('prefers x-request-id over x-correlation-id', () => {
    expect(
      resolveRequestId({
        [REQUEST_ID_HEADER]: 'req-1',
        [CORRELATION_ID_HEADER]: 'corr-1',
      }),
    ).toBe('req-1');
  });

  it('falls back to x-correlation-id', () => {
    expect(resolveRequestId({ [CORRELATION_ID_HEADER]: 'corr-2' })).toBe('corr-2');
  });

  it('rejects blank, oversized, or newline-containing values', () => {
    expect(resolveRequestId({ [REQUEST_ID_HEADER]: '   ' })).toBeUndefined();
    expect(resolveRequestId({ [REQUEST_ID_HEADER]: 'a'.repeat(129) })).toBeUndefined();
    expect(resolveRequestId({ [REQUEST_ID_HEADER]: 'bad\nid' })).toBeUndefined();
  });

  it('resolveOrCreateRequestId generates a uuid when missing', () => {
    const id = resolveOrCreateRequestId({});
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

describe('assignIncomingRequestId', () => {
  it('reuses x-request-id and stamps it on the request', () => {
    const req: { headers: Record<string, string>; id?: string } = {
      headers: { [REQUEST_ID_HEADER]: 'incoming-id' },
    };
    expect(assignIncomingRequestId(req)).toBe('incoming-id');
    expect(req.id).toBe('incoming-id');
  });

  it('keeps an id already present on the request', () => {
    const req = { headers: {}, id: 'already-set' };
    expect(assignIncomingRequestId(req)).toBe('already-set');
  });
});

describe('resolveRequestId', () => {
  it('prefers x-request-id over x-correlation-id', () => {
    expect(
      resolveRequestId({
        [REQUEST_ID_HEADER]: 'req-1',
        [CORRELATION_ID_HEADER]: 'corr-1',
      }),
    ).toBe('req-1');
  });

  it('falls back to x-correlation-id', () => {
    expect(resolveRequestId({ [CORRELATION_ID_HEADER]: 'corr-2' })).toBe('corr-2');
  });

  it('rejects blank, oversized, or newline-containing values', () => {
    expect(resolveRequestId({ [REQUEST_ID_HEADER]: '   ' })).toBeUndefined();
    expect(resolveRequestId({ [REQUEST_ID_HEADER]: 'a'.repeat(129) })).toBeUndefined();
    expect(resolveRequestId({ [REQUEST_ID_HEADER]: 'bad\nid' })).toBeUndefined();
  });

  it('resolveOrCreateRequestId generates a uuid when missing', () => {
    const id = resolveOrCreateRequestId({});
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
