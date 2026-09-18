import { detectRasterMagic, looksLikePdf, looksLikeSvg } from '@modules/image-pipeline/utils/image-bytes.util';
import { SUPPORTED_IMAGE_MIMES } from './types';

/** Normalize legacy BMP Content-Type aliases to image/bmp. */
export const normalizeImageMime = (mime: string | null | undefined): string => {
  const raw = (mime ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (!raw || raw === 'application/octet-stream' || raw === 'binary/octet-stream') {
    return '';
  }
  if (raw === 'image/x-ms-bmp' || raw === 'image/x-bmp') return 'image/bmp';
  return raw;
};

export const mimeFromFilename = (filename: string): string => {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.jpeg') || lower.endsWith('.jpg')) return 'image/jpeg';
  return 'image/jpeg';
};

export const resolveDeclaredMime = (
  filename: string,
  contentType: string | null,
): string => {
  const normalized = normalizeImageMime(contentType);
  if (normalized) return normalized;
  return mimeFromFilename(filename);
};

export type ContentValidationResult =
  | { ok: true; mime: string }
  | { ok: false; error: string; mime?: string };

/**
 * Validate buffer is a supported raster image (not HTML error page / empty / oversize).
 * Prefers magic bytes over Content-Type.
 */
export const validateImageBuffer = (
  buffer: Buffer,
  declaredMime: string,
  maxBytes: number,
): ContentValidationResult => {
  if (!buffer.length) {
    return { ok: false, error: 'Empty response body' };
  }
  if (buffer.length > maxBytes) {
    return { ok: false, error: `Response exceeds max size ${maxBytes} bytes` };
  }

  const head = buffer.subarray(0, Math.min(256, buffer.length)).toString('utf8').trim().toLowerCase();
  if (
    head.startsWith('<!doctype html') ||
    head.startsWith('<html') ||
    head.startsWith('<head') ||
    head.includes('<title>404')
  ) {
    return { ok: false, error: 'HTML/error page returned with image response', mime: 'text/html' };
  }

  if (looksLikeSvg(buffer)) {
    return { ok: false, error: 'SVG is not supported for media backfill', mime: 'image/svg+xml' };
  }
  if (looksLikePdf(buffer)) {
    return { ok: false, error: 'PDF is not supported for image backfill', mime: 'application/pdf' };
  }

  const magic = detectRasterMagic(buffer);
  if (magic && SUPPORTED_IMAGE_MIMES.has(magic)) {
    return { ok: true, mime: magic };
  }

  const normalizedDeclared = normalizeImageMime(declaredMime);
  if (normalizedDeclared && SUPPORTED_IMAGE_MIMES.has(normalizedDeclared) && magic === null) {
    // Some BMPs / edge cases — still reject if magic unknown and declared unsupported path
    if (normalizedDeclared === 'image/bmp') {
      return { ok: false, error: 'Buffer is not a valid BMP/raster signature', mime: normalizedDeclared };
    }
  }

  if (magic) {
    return { ok: false, error: `Unsupported raster type from signature: ${magic}`, mime: magic };
  }

  return {
    ok: false,
    error: `Unsupported or unrecognized image content (declared=${normalizedDeclared || 'none'})`,
    mime: normalizedDeclared || undefined,
  };
};
