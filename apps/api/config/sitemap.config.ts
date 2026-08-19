import { registerAs } from '@nestjs/config';

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
};

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const sitemapConfig = registerAs('sitemap', () => {
  const baseUrl = (process.env['SITEMAP_BASE_URL'] || process.env['STOREFRONT_URL'] || '')
    .trim()
    .replace(/\/+$/, '');

  return {
    enabled: parseBoolean(process.env['SITEMAP_ENABLED'], true),
    baseUrl,
    batchSize: parsePositiveInt(process.env['SITEMAP_BATCH_SIZE'], 10_000),
    maxUrlsPerFile: parsePositiveInt(process.env['SITEMAP_MAX_URLS_PER_FILE'], 50_000),
    debounceMs: parsePositiveInt(process.env['SITEMAP_DEBOUNCE_MS'], 60_000),
    regenerationIntervalSeconds: parsePositiveInt(
      process.env['SITEMAP_REGENERATION_INTERVAL'],
      3600,
    ),
    storagePath: (process.env['SITEMAP_STORAGE_PATH'] ?? 'sitemaps').replace(/^\/+|\/+$/g, ''),
    forceFullRebuild: parseBoolean(process.env['SITEMAP_FORCE_FULL_REBUILD'], false),
  };
});
