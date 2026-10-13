/** Collapse IPv4-mapped IPv6 (`::ffff:1.2.3.4`) to IPv4. */
export function normalizeIpAddress(ip: string | null | undefined): string | null {
  if (!ip?.trim()) return null;
  const value = ip.trim();
  const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  return mapped ? mapped[1] : value;
}

/**
 * Uses the IP Fastify already resolved from `trustProxy`.
 * Raw `X-Forwarded-For` is ignored so an untrusted client cannot spoof it.
 */
export function resolveTrustedClientIp(req: { ip?: string | null }): string | null {
  return normalizeIpAddress(req.ip);
}
