import { registerAs } from '@nestjs/config';

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
};

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const DEFAULT_WIDTHS = [100, 160, 240, 480, 800, 1200, 1600];

const parseWidths = (value: string | undefined): number[] => {
  if (!value?.trim()) return DEFAULT_WIDTHS;
  const parsed = value
    .split(',')
    .map((item) => parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item) && item > 0);
  return parsed.length > 0 ? [...new Set(parsed)].sort((a, b) => a - b) : DEFAULT_WIDTHS;
};

export const imagePipelineConfig = registerAs('imagePipeline', () => {
  const quality = parsePositiveInt(process.env['IMAGE_WEBP_QUALITY'], 80);

  return {
    deliveryEnabled: parseBoolean(process.env['IMAGE_DELIVERY_ENABLED'], false),
    processingEnabled: parseBoolean(process.env['IMAGE_PROCESSING_ENABLED'], false),
    workerEnabled: parseBoolean(process.env['IMAGE_WORKER_ENABLED'], false),
    workerConcurrency: Math.min(parsePositiveInt(process.env['IMAGE_WORKER_CONCURRENCY'], 1), 4),
    pipelineVersion: (process.env['IMAGE_PIPELINE_VERSION'] ?? 'v1').trim() || 'v1',
    derivativePrefix: (process.env['IMAGE_DERIVATIVE_PREFIX'] ?? 'derivatives').replace(/^\/+|\/+$/g, ''),
    allowedWidths: parseWidths(process.env['IMAGE_ALLOWED_WIDTHS']),
    webpQuality: Math.min(Math.max(quality, 50), 90),
    maxInputBytes: parsePositiveInt(process.env['IMAGE_MAX_INPUT_BYTES'], 15 * 1024 * 1024),
    maxDecodedPixels: parsePositiveInt(process.env['IMAGE_MAX_DECODED_PIXELS'], 40_000_000),
    processTimeoutMs: parsePositiveInt(process.env['IMAGE_PROCESS_TIMEOUT_MS'], 30_000),
    retryAttempts: parsePositiveInt(process.env['IMAGE_RETRY_ATTEMPTS'], 5),
    retryBackoffMs: parsePositiveInt(process.env['IMAGE_RETRY_BACKOFF_MS'], 5_000),
    jobRetentionComplete: parsePositiveInt(process.env['IMAGE_JOB_RETENTION_COMPLETE'], 100),
    jobRetentionFailed: parsePositiveInt(process.env['IMAGE_JOB_RETENTION_FAILED'], 200),
    reconcileIntervalMs: parsePositiveInt(process.env['IMAGE_RECONCILE_INTERVAL_MS'], 300_000),
    reconcileBatchSize: parsePositiveInt(process.env['IMAGE_RECONCILE_BATCH_SIZE'], 50),
    backfillBatchSize: parsePositiveInt(process.env['IMAGE_BACKFILL_BATCH_SIZE'], 50),
    backfillRateLimitMs: parsePositiveInt(process.env['IMAGE_BACKFILL_RATE_LIMIT_MS'], 100),
    signedUrlTtlSeconds: parsePositiveInt(
      process.env['IMAGE_SIGNED_URL_TTL_SECONDS'] ?? process.env['GCS_SIGNED_URL_TTL_SECONDS'],
      86400,
    ),
  };
});
