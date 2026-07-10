import { registerUnicommerceContentTypeCompat } from './unicommerce-fastify.plugin';

function createMockRequest(
  overrides: Partial<{ url: string; method: string; headers: Record<string, string | string[] | undefined> }>,
) {
  return {
    url: '/api/v1/unicommerce/authToken',
    method: 'POST',
    headers: {},
    ...overrides,
  };
}

describe('registerUnicommerceContentTypeCompat', () => {
  let hook: (
    request: ReturnType<typeof createMockRequest>,
    reply: unknown,
    payload: unknown,
    done: (err: Error | null, payload?: unknown) => void,
  ) => void;

  beforeEach(() => {
    const fastify = {
      addHook: jest.fn((_name: string, fn: typeof hook) => {
        hook = fn;
      }),
    };

    registerUnicommerceContentTypeCompat(fastify);
  });

  it('registers a preParsing hook', () => {
    expect(hook).toBeDefined();
  });

  it('sets application/json when Content-Type is missing on UniCommerce POST', () => {
    const request = createMockRequest({ headers: {} });
    const done = jest.fn();

    hook(request, {}, 'payload', done);

    expect(request.headers['content-type']).toBe('application/json');
    expect(done).toHaveBeenCalledWith(null, 'payload');
  });

  it('sets application/json when Content-Type is blank on UniCommerce POST', () => {
    const request = createMockRequest({ headers: { 'content-type': '   ' } });
    const done = jest.fn();

    hook(request, {}, 'payload', done);

    expect(request.headers['content-type']).toBe('application/json');
    expect(done).toHaveBeenCalledWith(null, 'payload');
  });

  it('does not override application/json Content-Type on UniCommerce routes', () => {
    const request = createMockRequest({
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
    const done = jest.fn();

    hook(request, {}, 'payload', done);

    expect(request.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(done).toHaveBeenCalledWith(null, 'payload');
  });

  it('rewrites text/xml to application/json on UniCommerce POST', () => {
    const request = createMockRequest({
      headers: { 'content-type': 'text/xml; charset=UTF-8' },
    });
    const done = jest.fn();

    hook(request, {}, 'payload', done);

    expect(request.headers['content-type']).toBe('application/json');
    expect(done).toHaveBeenCalledWith(null, 'payload');
  });

  it('ignores non-UniCommerce routes', () => {
    const request = createMockRequest({
      url: '/api/v1/products',
      headers: {},
    });
    const done = jest.fn();

    hook(request, {}, 'payload', done);

    expect(request.headers['content-type']).toBeUndefined();
    expect(done).toHaveBeenCalledWith(null, 'payload');
  });

  it('ignores GET requests on UniCommerce routes', () => {
    const request = createMockRequest({
      method: 'GET',
      url: '/api/v1/unicommerce/productsCount',
      headers: {},
    });
    const done = jest.fn();

    hook(request, {}, 'payload', done);

    expect(request.headers['content-type']).toBeUndefined();
    expect(done).toHaveBeenCalledWith(null, 'payload');
  });
});
