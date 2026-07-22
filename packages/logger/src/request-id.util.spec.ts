import { resolveRequestId, resolveOrCreateRequestId } from './request-id.util';
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
