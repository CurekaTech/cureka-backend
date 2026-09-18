import {
  CUREKA_MEDIA_UA,
  DEFAULT_HTTP_TIMEOUT_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_IMAGE_BYTES,
  DEFAULT_MAX_REDIRECTS,
} from './types';
import { isPrivateOrLocalHostname } from './url.util';

export type FetchImageResult =
  | {
      ok: true;
      status: number;
      buffer: Buffer;
      contentType: string | null;
      finalUrl: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
      retryable: boolean;
      finalUrl: string;
    };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isRetryableStatus = (status: number): boolean =>
  status === 408 || status === 429 || status >= 500;

export type FetchImageOptions = {
  timeoutMs?: number;
  maxAttempts?: number;
  maxRedirects?: number;
  maxBytes?: number;
  userAgent?: string;
};

/**
 * Fetch image with redirect limit, timeout, retries on 408/429/5xx, no retry on 404.
 * Rejects redirects to non-http(s) or private hosts.
 */
export const fetchImageWithRetry = async (
  url: string,
  options: FetchImageOptions = {},
): Promise<FetchImageResult> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  const userAgent = options.userAgent ?? CUREKA_MEDIA_UA;

  let lastError = 'Unknown fetch error';
  let lastStatus = 0;
  let finalUrl = url;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await fetchOnce(url, {
        timeoutMs,
        maxRedirects,
        maxBytes,
        userAgent,
      });
      finalUrl = result.finalUrl;
      if (result.ok) return result;

      lastStatus = result.status;
      lastError = result.error;
      if (!result.retryable || attempt === maxAttempts) {
        return result;
      }
      await sleep(500 * 2 ** (attempt - 1));
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      lastStatus = 0;
      if (attempt === maxAttempts) {
        return {
          ok: false,
          status: lastStatus,
          error: lastError,
          retryable: true,
          finalUrl,
        };
      }
      await sleep(500 * 2 ** (attempt - 1));
    }
  }

  return {
    ok: false,
    status: lastStatus,
    error: lastError,
    retryable: false,
    finalUrl,
  };
};

const fetchOnce = async (
  startUrl: string,
  opts: {
    timeoutMs: number;
    maxRedirects: number;
    maxBytes: number;
    userAgent: string;
  },
): Promise<FetchImageResult> => {
  let current = startUrl;
  for (let redirect = 0; redirect <= opts.maxRedirects; redirect += 1) {
    const parsed = new URL(current);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        ok: false,
        status: 0,
        error: `Unsupported protocol: ${parsed.protocol}`,
        retryable: false,
        finalUrl: current,
      };
    }
    if (isPrivateOrLocalHostname(parsed.hostname)) {
      return {
        ok: false,
        status: 0,
        error: `Refusing private/local host: ${parsed.hostname}`,
        retryable: false,
        finalUrl: current,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': opts.userAgent,
          Accept: 'image/*,*/*;q=0.8',
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          return {
            ok: false,
            status: response.status,
            error: 'Redirect without Location header',
            retryable: false,
            finalUrl: current,
          };
        }
        current = new URL(location, current).toString();
        continue;
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: `HTTP ${response.status} for ${current}`,
          retryable: isRetryableStatus(response.status),
          finalUrl: current,
        };
      }

      const contentLength = Number(response.headers.get('content-length') ?? 0);
      if (contentLength > opts.maxBytes) {
        return {
          ok: false,
          status: response.status,
          error: `Content-Length ${contentLength} exceeds max ${opts.maxBytes}`,
          retryable: false,
          finalUrl: current,
        };
      }

      const reader = response.body?.getReader();
      if (!reader) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > opts.maxBytes) {
          return {
            ok: false,
            status: response.status,
            error: `Body exceeds max ${opts.maxBytes}`,
            retryable: false,
            finalUrl: current,
          };
        }
        return {
          ok: true,
          status: response.status,
          buffer,
          contentType: response.headers.get('content-type'),
          finalUrl: current,
        };
      }

      const chunks: Buffer[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        total += chunk.length;
        if (total > opts.maxBytes) {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          return {
            ok: false,
            status: response.status,
            error: `Body exceeds max ${opts.maxBytes}`,
            retryable: false,
            finalUrl: current,
          };
        }
        chunks.push(chunk);
      }

      return {
        ok: true,
        status: response.status,
        buffer: Buffer.concat(chunks),
        contentType: response.headers.get('content-type'),
        finalUrl: current,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    status: 0,
    error: `Too many redirects (>${opts.maxRedirects})`,
    retryable: false,
    finalUrl: current,
  };
};
