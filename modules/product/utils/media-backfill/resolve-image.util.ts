import {
  DEFAULT_MAX_IMAGE_BYTES,
  ManifestIndex,
  OverrideMapping,
  ResolvedImageSource,
} from './types';
import { fetchImageWithRetry } from './http-fetch.util';
import { lookupManifestCandidates } from './manifest.util';
import { findOverride } from './override-mapping.util';
import { resolveDeclaredMime, validateImageBuffer } from './mime.util';
import {
  basenameFromUrl,
  buildLegacyUrlFromRelativePath,
  isMalformedLegacyUrl,
  rewriteToLegacyOrigin,
} from './url.util';

export type ResolveImageOptions = {
  manifest?: ManifestIndex | null;
  mapping?: OverrideMapping | null;
  maxBytes?: number;
  /** When true, skip body download validation after confirming URL resolves (audit light). */
  validateContent?: boolean;
};

/**
 * Resolve a sheet image URL: normalize → override → exact fetch → 404 manifest fallback.
 * Never auto-picks among multiple manifest candidates.
 */
export const resolveImageSource = async (
  originalUrl: string,
  options: ResolveImageOptions = {},
): Promise<ResolvedImageSource> => {
  const validateContent = options.validateContent !== false;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  const rewrittenUrl = rewriteToLegacyOrigin(originalUrl);

  if (isMalformedLegacyUrl(rewrittenUrl) || isMalformedLegacyUrl(originalUrl)) {
    return {
      status: 'MALFORMED_URL',
      originalUrl,
      rewrittenUrl,
      candidatePaths: [],
      errorMessage: 'Malformed or truncated URL',
    };
  }

  const override = findOverride(options.mapping, originalUrl);
  let attemptUrl = override?.resolvedUrl ?? rewrittenUrl;
  const usedOverride = Boolean(override);

  const attemptFetch = async (url: string): Promise<ResolvedImageSource> => {
    const fetched = await fetchImageWithRetry(url, { maxBytes });
    if (!fetched.ok) {
      return {
        status: fetched.status === 404 ? 'MISSING_SOURCE' : 'HTTP_ERROR',
        originalUrl,
        rewrittenUrl,
        resolvedUrl: fetched.finalUrl,
        httpStatus: fetched.status,
        candidatePaths: [],
        errorMessage: fetched.error,
      };
    }

    if (!validateContent) {
      return {
        status: usedOverride ? 'OVERRIDE' : 'SUCCESS',
        originalUrl,
        rewrittenUrl,
        resolvedUrl: fetched.finalUrl,
        httpStatus: fetched.status,
        detectedMime: resolveDeclaredMime(
          basenameFromUrl(fetched.finalUrl) || 'image.jpg',
          fetched.contentType,
        ),
        candidatePaths: [],
        buffer: fetched.buffer,
        filename: basenameFromUrl(fetched.finalUrl) || 'image.jpg',
      };
    }

    const filename = basenameFromUrl(fetched.finalUrl) || 'image.jpg';
    const declared = resolveDeclaredMime(filename, fetched.contentType);
    const validated = validateImageBuffer(fetched.buffer, declared, maxBytes);
    if (!validated.ok) {
      return {
        status: 'UNSUPPORTED_MEDIA',
        originalUrl,
        rewrittenUrl,
        resolvedUrl: fetched.finalUrl,
        httpStatus: fetched.status,
        detectedMime: validated.mime ?? declared,
        candidatePaths: [],
        errorMessage: validated.error,
      };
    }

    return {
      status: usedOverride ? 'OVERRIDE' : 'SUCCESS',
      originalUrl,
      rewrittenUrl,
      resolvedUrl: fetched.finalUrl,
      httpStatus: fetched.status,
      detectedMime: validated.mime,
      candidatePaths: [],
      buffer: fetched.buffer,
      filename,
    };
  };

  const first = await attemptFetch(attemptUrl);
  if (first.status === 'SUCCESS' || first.status === 'OVERRIDE') {
    return first;
  }

  // Only fall back to manifest on confirmed 404 of the exact/override URL
  if (first.httpStatus !== 404) {
    return first;
  }

  const filename = basenameFromUrl(attemptUrl) || basenameFromUrl(rewrittenUrl);
  const candidates = lookupManifestCandidates(options.manifest, filename);

  if (candidates.length === 0) {
    return {
      ...first,
      status: 'MISSING_SOURCE',
      candidatePaths: [],
      errorMessage: first.errorMessage ?? `HTTP 404 and no manifest match for ${filename}`,
    };
  }

  if (candidates.length > 1) {
    return {
      status: 'AMBIGUOUS_SOURCE',
      originalUrl,
      rewrittenUrl,
      resolvedUrl: attemptUrl,
      httpStatus: 404,
      candidatePaths: candidates,
      errorMessage: `Ambiguous basename "${filename}" — ${candidates.length} candidates`,
    };
  }

  const correctedUrl = buildLegacyUrlFromRelativePath(candidates[0]);
  const second = await attemptFetch(correctedUrl);
  if (second.status === 'SUCCESS' || second.status === 'OVERRIDE') {
    return {
      ...second,
      status: 'SUCCESS',
      candidatePaths: candidates,
    };
  }

  return {
    ...second,
    candidatePaths: candidates,
    errorMessage:
      second.errorMessage ??
      `Manifest candidate failed: ${candidates[0]}`,
  };
};
