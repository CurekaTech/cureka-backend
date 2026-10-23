import { FastifyInstance } from 'fastify';

/** Browsers send report-uri as application/csp-report, not application/json. */
export const CSP_REPORT_CONTENT_TYPES = [
  'application/csp-report',
  'application/reports+json',
] as const;

export function parseCspReportBody(body: string): unknown {
  const text = body.trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { unparsed: text.slice(0, 2000) };
  }
}

export function registerCspReportParsers(fastify: FastifyInstance): void {
  const parse = (
    _request: unknown,
    body: string | Buffer,
    done: (error: null, parsed: unknown) => void,
  ): void => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    done(null, parseCspReportBody(text));
  };

  for (const type of CSP_REPORT_CONTENT_TYPES) {
    fastify.addContentTypeParser(type, { parseAs: 'string' }, parse);
  }
}
