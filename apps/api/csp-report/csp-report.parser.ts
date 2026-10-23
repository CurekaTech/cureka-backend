/** Browsers send report-uri as application/csp-report, not application/json. */
export const CSP_REPORT_CONTENT_TYPES = [
  'application/csp-report',
  'application/reports+json',
] as const;

/**
 * Nest's HTTP adapter and this app resolve different Fastify copies, so the
 * instance is accepted structurally instead of as FastifyInstance.
 */
type CspReportServer = {
  addContentTypeParser: (
    type: string,
    opts: { parseAs: 'string' },
    parser: (
      request: unknown,
      body: string | Buffer,
      done: (error: null, parsed: unknown) => void,
    ) => void,
  ) => void;
};

export function parseCspReportBody(body: string): unknown {
  const text = body.trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { unparsed: text.slice(0, 2000) };
  }
}

export function registerCspReportParsers(fastify: CspReportServer): void {
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
