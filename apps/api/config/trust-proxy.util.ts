import { isIP } from 'net';

export class TrustProxyConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrustProxyConfigurationError';
  }
}

/** Names accepted by `proxy-addr`, which Fastify uses for `trustProxy`. */
const PROXY_ADDR_NAMES = new Set(['loopback', 'linklocal', 'uniquelocal']);

/**
 * `TRUST_PROXY` is the allowlist of hops in front of this process.
 * Unset trusts only loopback (`127.0.0.0/8` and `::1`).
 * `false` trusts nobody.
 * A comma-separated IP, CIDR, or proxy-addr name trusts those hops.
 * `true`, `0.0.0.0/0`, and `::/0` trust every address and are rejected in every environment.
 */
export function resolveTrustProxy(
  raw: string | undefined,
  nodeEnv: string | undefined,
): boolean | string | string[] {
  const value = raw?.trim() ?? '';
  if (!value) return 'loopback';
  if (value.toLowerCase() === 'false') return false;
  if (value.toLowerCase() === 'true') {
    throw new TrustProxyConfigurationError(
      `TRUST_PROXY=true trusts every address and is not allowed in ${environmentLabel(nodeEnv)}. Set it to the proxy IP or CIDR list.`,
    );
  }

  const hops = value
    .split(',')
    .map((hop) => hop.trim())
    .filter(Boolean);
  if (!hops.length) return false;

  for (const hop of hops) {
    assertTrustedHop(hop, nodeEnv);
  }
  return hops.length === 1 ? hops[0] : hops;
}

function assertTrustedHop(hop: string, nodeEnv: string | undefined): void {
  if (PROXY_ADDR_NAMES.has(hop.toLowerCase())) return;

  if (hop.includes('/')) {
    assertCidr(hop, nodeEnv);
    return;
  }

  if (!isIP(hop)) {
    throw new TrustProxyConfigurationError(
      `TRUST_PROXY hop "${hop}" is not a valid IP, CIDR, or proxy-addr name (loopback, linklocal, uniquelocal).`,
    );
  }
}

function assertCidr(hop: string, nodeEnv: string | undefined): void {
  const slash = hop.lastIndexOf('/');
  const address = hop.slice(0, slash);
  const prefixRaw = hop.slice(slash + 1);
  const version = isIP(address);
  const prefix = Number(prefixRaw);
  const maxPrefix = version === 4 ? 32 : version === 6 ? 128 : -1;
  const prefixIsInteger = /^\d+$/.test(prefixRaw);

  if (!version || !prefixIsInteger || prefix < 0 || prefix > maxPrefix) {
    throw new TrustProxyConfigurationError(
      `TRUST_PROXY hop "${hop}" is not a valid IP, CIDR, or proxy-addr name (loopback, linklocal, uniquelocal).`,
    );
  }

  if (prefix === 0) {
    throw new TrustProxyConfigurationError(
      `TRUST_PROXY hop "${hop}" trusts every address and is not allowed in ${environmentLabel(nodeEnv)}. Set a specific proxy IP or CIDR.`,
    );
  }
}

function environmentLabel(nodeEnv: string | undefined): string {
  const label = nodeEnv?.trim();
  return label || 'this environment';
}
