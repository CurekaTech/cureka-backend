const UNICOMMERCE_PATH = '/api/v1/unicommerce/';

interface FastifyPreParsingHook {
  addHook(
    name: 'preParsing',
    hook: (
      request: { url: string; method: string; headers: Record<string, string | string[] | undefined> },
      reply: unknown,
      payload: unknown,
      done: (err: Error | null, payload?: unknown) => void,
    ) => void,
  ): void;
}

/**
 * UniCommerce panel sends JSON POST bodies without a Content-Type header.
 * Fastify skips JSON parsing in that case, so @Body() arrives empty and validation fails.
 * For UniCommerce routes only, default missing Content-Type to application/json.
 */
export function registerUnicommerceContentTypeCompat(fastify: FastifyPreParsingHook): void {
  fastify.addHook('preParsing', (request, _reply, payload, done) => {
    if (!request.url.startsWith(UNICOMMERCE_PATH)) {
      done(null, payload);
      return;
    }

    const method = request.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      done(null, payload);
      return;
    }

    const contentType = request.headers['content-type'];
    if (!contentType || !String(contentType).trim()) {
      request.headers['content-type'] = 'application/json';
    }

    done(null, payload);
  });
}
