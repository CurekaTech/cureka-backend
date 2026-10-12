export class TrustProxyConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrustProxyConfigurationError';
  }
}

/**
 * `TRUST_PROXY` matches the proxy hops in front of this process.
 * Unset trusts only loopback, so nginx on this machine can pass the client IP.
 * `false` trusts nobody. A comma-separated IP, CIDR, or proxy-addr name trusts those hops.
 * `true` trusts every hop and is refused in production.
 */
export function resolveTrustProxy(
  raw: string | undefined,
  nodeEnv: string | undefined,
): boolean | string | string[] {
  const value = raw?.trim() ?? '';
  if (!value) return 'loopback';
  if (value.toLowerCase() === 'false') return false;
  if (value.toLowerCase() === 'true') {
    if ((nodeEnv ?? 'development') === 'production') {
      throw new TrustProxyConfigurationError(
        'TRUST_PROXY=true trusts every client and is not allowed in production. Set it to the proxy IP or CIDR list.',
      );
    }
    return true;
  }
  const hops = value
    .split(',')
    .map((hop) => hop.trim())
    .filter(Boolean);
  if (!hops.length) return false;
  return hops;
}
