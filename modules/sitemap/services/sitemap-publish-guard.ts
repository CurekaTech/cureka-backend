/** Public storefront origin that must appear in live sitemap `<loc>` values. */
export const LIVE_SITEMAP_ORIGIN = 'https://www.cureka.com';

/** GCS bucket that backs https://www.cureka.com sitemap files. */
export const PRODUCTION_SITEMAP_BUCKET = 'cureka-files-prod';

export interface SitemapPublishGuardInput {
  baseUrl: string;
  storageDriver: string;
  bucket?: string | null;
  liveOrigin?: string | null;
}

const normalizeOrigin = (value: string | null | undefined): string =>
  (value ?? '').trim().replace(/\/+$/, '');

/**
 * Stops a staging/local env from publishing techbv (or any other host) into the
 * live sitemap. The hourly worker and `npm run sitemap:generate` both call this
 * before any XML is written.
 */
export const assertSitemapPublishAllowed = (input: SitemapPublishGuardInput): void => {
  const baseUrl = normalizeOrigin(input.baseUrl);
  const liveOrigin = normalizeOrigin(input.liveOrigin);
  const bucket = (input.bucket ?? '').trim();
  const writingProductionBucket =
    input.storageDriver === 'gcs' && bucket === PRODUCTION_SITEMAP_BUCKET;

  if (liveOrigin === LIVE_SITEMAP_ORIGIN && baseUrl !== LIVE_SITEMAP_ORIGIN) {
    throw new Error(
      `Refusing to replace the live sitemap (${liveOrigin}) with ${baseUrl}. ` +
        `Set SITEMAP_BASE_URL=${LIVE_SITEMAP_ORIGIN} on this machine and run sitemap:generate there. ` +
        `Do not generate from a techbv/local .env while GCS_BUCKET_NAME is ${PRODUCTION_SITEMAP_BUCKET}.`,
    );
  }

  if (writingProductionBucket && baseUrl !== LIVE_SITEMAP_ORIGIN) {
    throw new Error(
      `Refusing to write sitemap host ${baseUrl || '(missing)'} into production bucket ${bucket}. ` +
        `SITEMAP_BASE_URL must be ${LIVE_SITEMAP_ORIGIN}. ` +
        `A techbv STOREFRONT_URL on this machine would put staging URLs on https://www.cureka.com/sitemap.xml.`,
    );
  }
};
