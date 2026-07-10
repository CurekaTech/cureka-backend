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

/** UniCommerce HTTP client often labels JSON bodies as text/xml. */
const UNICOMMERCE_JSON_CONTENT_TYPES = new Set([
  'text/xml',
  'application/xml',
  'text/plain',
]);

function normalizeContentType(contentType: string | string[] | undefined): string {
  if (Array.isArray(contentType)) {
    return contentType[0]?.trim() ?? '';
  }
  return contentType?.trim() ?? '';
}

function shouldTreatAsJson(contentType: string): boolean {
  if (!contentType) {
    return true;
  }

  const mediaType = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (mediaType === 'application/json') {
    return false;
  }

  return UNICOMMERCE_JSON_CONTENT_TYPES.has(mediaType);
}

/**
 * UniCommerce HTTP client quirks on marketplace routes:
 * - POST bodies may omit Content-Type entirely
 * - POST bodies may be JSON while Content-Type is text/xml (see connector auth logs)
 * Fastify rejects those with 415 before NestJS can read @Body().
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

    const contentType = normalizeContentType(request.headers['content-type']);
    if (shouldTreatAsJson(contentType)) {
      request.headers['content-type'] = 'application/json';
    }

    done(null, payload);
  });
}
