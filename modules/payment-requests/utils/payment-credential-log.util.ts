/** Safe credential diagnostics for payment gateway logs (never dump full secrets). */

export function maskSecret(value?: string | null): {
  present: boolean;
  length: number;
  prefix: string | null;
  suffix: string | null;
  masked: string | null;
} {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return { present: false, length: 0, prefix: null, suffix: null, masked: null };
  }
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-4);
  return {
    present: true,
    length: trimmed.length,
    prefix,
    suffix,
    masked: `${prefix}${'*'.repeat(Math.max(0, trimmed.length - 8))}${suffix}`,
  };
}

export function describeCashfreeEnv(config: {
  appId?: string | null;
  secretKey?: string | null;
  envRaw?: string | null;
  envNormalized?: string | null;
  apiVersion?: string | null;
  baseUrl?: string | null;
  webhookSecret?: string | null;
}) {
  return {
    CASHFREE_ENV_raw: config.envRaw ?? null,
    CASHFREE_ENV: config.envNormalized ?? null,
    CASHFREE_API_VERSION: config.apiVersion ?? null,
    CASHFREE_BASE_URL: config.baseUrl ?? null,
    CASHFREE_APP_ID: config.appId?.trim() || null,
    CASHFREE_APP_ID_length: config.appId?.trim().length ?? 0,
    CASHFREE_SECRET_KEY: maskSecret(config.secretKey),
    CASHFREE_WEBHOOK_SECRET: maskSecret(config.webhookSecret),
  };
}
