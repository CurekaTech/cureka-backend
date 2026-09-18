export type MediaResolveStatus =
  | 'SUCCESS'
  | 'MISSING_SOURCE'
  | 'AMBIGUOUS_SOURCE'
  | 'MALFORMED_URL'
  | 'UNSUPPORTED_MEDIA'
  | 'FAILED_UPLOAD'
  | 'SKIPPED_EXISTING'
  | 'SKIPPED_CACHED'
  | 'HTTP_ERROR'
  | 'OVERRIDE';

export type MediaReportRow = {
  external_product_id?: string;
  product_ref_id?: string;
  sku?: string;
  original_url: string;
  rewritten_url?: string;
  resolved_url?: string;
  status: MediaResolveStatus;
  http_status?: number | '';
  detected_mime?: string;
  candidate_paths?: string;
  error_message?: string;
  gcs_key?: string;
  timestamp: string;
};

export type ManifestIndex = {
  /** lowercase decoded basename → relative paths under wp-content/uploads */
  byBasename: Map<string, string[]>;
  entryCount: number;
  fingerprint: string;
};

export type OverrideMapping = {
  byOriginalUrl: Map<string, { resolvedUrl: string; note?: string }>;
  invalid: Array<{ original_url: string; resolved_url: string; error: string }>;
};

export type ResolvedImageSource = {
  status: MediaResolveStatus;
  originalUrl: string;
  rewrittenUrl: string;
  resolvedUrl?: string;
  httpStatus?: number;
  detectedMime?: string;
  candidatePaths: string[];
  errorMessage?: string;
  buffer?: Buffer;
  filename?: string;
};

export const LEGACY_ORIGIN = 'https://legacy.cureka.com';
export const DEFAULT_MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_REDIRECTS = 5;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const CUREKA_MEDIA_UA =
  'Mozilla/5.0 (compatible; CurekaMediaMigration/1.0; +https://www.cureka.com)';

export const SUPPORTED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
]);
