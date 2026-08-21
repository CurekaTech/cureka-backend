import { randomUUID } from 'crypto';
import { CORRELATION_ID_HEADER, REQUEST_ID_HEADER } from './logging.constants';

type HeaderBag = string | string[] | undefined;

/**
 * Resolve a request/correlation id from incoming headers.
 * Prefers x-request-id, then x-correlation-id. Returns undefined when absent/invalid.
 */
export function resolveRequestId(
  headers: Record<string, HeaderBag> | undefined | null,
): string | undefined {
  if (!headers) {
    return undefined;
  }

  const raw =
    firstHeaderValue(headers[REQUEST_ID_HEADER]) ??
    firstHeaderValue(headers[CORRELATION_ID_HEADER]) ??
    firstHeaderValue(headers['X-Request-Id']) ??
    firstHeaderValue(headers['X-Correlation-Id']);

  if (!raw) {
    return undefined;
  }

  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 128) {
    return undefined;
  }

  // Reject values that could break log parsers / header injection
  if (/[\r\n]/.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

/** Resolve an existing id or generate a new UUID. */
export function resolveOrCreateRequestId(
  headers: Record<string, HeaderBag> | undefined | null,
): string {
  return resolveRequestId(headers) ?? randomUUID();
}

/**
 * Bind a request id onto the raw IncomingMessage so Fastify `request.id`
 * and pino-http `req.id` stay aligned, then return it.
 */
export function assignIncomingRequestId(req: {
  headers?: Record<string, HeaderBag> | null;
  id?: unknown;
}): string {
  const existing = typeof req.id === 'string' && req.id.trim() ? req.id : undefined;
  const id = existing ?? resolveOrCreateRequestId(req.headers);
  (req as { id?: string }).id = id;
  return id;
}

function firstHeaderValue(value: HeaderBag): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
