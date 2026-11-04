export const LOCAL_CORS_FALLBACK =
  'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://localhost:3001,http://localhost:3002';

const PANEL_PREFIXES = ['doctor.', 'admin.'] as const;

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function apexHost(hostname: string): string {
  return hostname.replace(/^www\./i, '');
}

function isPanelHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return PANEL_PREFIXES.some((prefix) => host.startsWith(prefix));
}

/** Storefront origin plus doctor/admin panel hosts on the same apex. */
export function panelOriginsFor(originOrUrl: string): string[] {
  const origin = normalizeOrigin(originOrUrl);
  if (!origin) return [];
  const url = new URL(origin);
  const host = apexHost(url.hostname);
  const origins = new Set<string>([`${url.protocol}//${url.host}`, `${url.protocol}//${host}`]);
  if (!isPanelHost(host)) {
    for (const prefix of PANEL_PREFIXES) {
      origins.add(`${url.protocol}//${prefix}${host}`);
    }
  }
  return [...origins];
}

/**
 * Builds the Fastify CORS origin allowlist.
 * Keeps every explicit CORS_ORIGINS value and adds doctor/admin siblings of the
 * storefront (and of each listed Cureka origin) so a new panel host does not
 * replace existing storefront/admin entries.
 */
export function resolveCorsOrigins(params: {
  corsOriginsEnv?: string | null;
  storefrontUrl?: string | null;
}): string[] {
  const listed = (params.corsOriginsEnv?.trim() || LOCAL_CORS_FALLBACK)
    .split(',')
    .map((value) => normalizeOrigin(value))
    .filter((value): value is string => Boolean(value));

  const origins = new Set<string>(listed);
  for (const origin of listed) {
    for (const extra of panelOriginsFor(origin)) {
      origins.add(extra);
    }
  }
  if (params.storefrontUrl?.trim()) {
    for (const extra of panelOriginsFor(params.storefrontUrl)) {
      origins.add(extra);
    }
  }
  return [...origins];
}
