/**
 * User-facing copy for bulk-upload image / group failure messages.
 * Keep technical detail in logs; show plain language in Error Summary UI.
 */

export function humanizeBulkUploadColumn(column: string): string {
  const normalized = column.trim();
  if (!normalized) return 'Sheet';

  if (/^common_media(_\d+(_url)?)?$/i.test(normalized) || normalized.toLowerCase() === 'common_media') {
    return 'Product images';
  }
  if (/^primary image/i.test(normalized)) {
    return 'Primary image';
  }
  if (/gallery image/i.test(normalized)) {
    return 'Gallery image';
  }
  if (/product id/i.test(normalized)) {
    return 'Product ID';
  }
  return normalized;
}

/**
 * Maps download/storage failures (e.g. "HTTP 404") to admin-friendly text.
 */
export function humanizeImageResolveError(
  resolveError: string | undefined,
  imageUrl?: string,
): { reason: string; suggestedFix: string } {
  const raw = String(resolveError ?? '').trim();
  const lower = raw.toLowerCase();
  const urlSuffix = imageUrl?.trim() ? ` Link used: ${imageUrl.trim()}` : '';

  if (!raw) {
    return {
      reason: `The product image could not be downloaded or saved.${urlSuffix}`,
      suggestedFix:
        'Open the image link in a browser. If it does not load, replace it with a working image URL, or upload the image in Media Gallery and paste that URL in the sheet.',
    };
  }

  if (/\b404\b/.test(lower) || lower.includes('not found')) {
    return {
      reason: `The product image link is broken — the file was not found on the website.${urlSuffix}`,
      suggestedFix:
        'Replace the image URL with a link that opens correctly in a browser, or upload the image to Media Gallery and use that URL in Primary Image URL / product image columns.',
    };
  }

  if (/\b403\b/.test(lower) || lower.includes('forbidden')) {
    return {
      reason: `The product image link could not be accessed (permission denied).${urlSuffix}`,
      suggestedFix:
        'Use a publicly reachable image URL, or upload the image to Media Gallery and paste that URL in the sheet.',
    };
  }

  if (/\b401\b/.test(lower) || lower.includes('unauthorized')) {
    return {
      reason: `The product image link requires login and cannot be imported automatically.${urlSuffix}`,
      suggestedFix:
        'Use a public image URL, or upload the image to Media Gallery and paste that URL in the sheet.',
    };
  }

  if (/\b5\d{2}\b/.test(lower) || lower.includes('bad gateway') || lower.includes('unavailable')) {
    return {
      reason: `The image website was temporarily unavailable while downloading the product image.${urlSuffix}`,
      suggestedFix: 'Wait a moment and re-upload, or replace the image URL with a stable public link.',
    };
  }

  if (lower.includes('maximum allowed size') || lower.includes('file too large') || lower.includes('too large')) {
    return {
      reason: 'The product image is larger than the allowed upload size.',
      suggestedFix: 'Compress or resize the image, then update the sheet URL / Media Gallery file and try again.',
    };
  }

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('abort')) {
    return {
      reason: `Downloading the product image took too long and was stopped.${urlSuffix}`,
      suggestedFix: 'Try again, or host a smaller/faster image URL and update the sheet.',
    };
  }

  if (lower.includes('fetch failed') || lower.includes('network') || lower.includes('enotfound')) {
    return {
      reason: `The product image could not be reached (network / DNS error).${urlSuffix}`,
      suggestedFix: 'Check the URL spelling, ensure the site is online, then update the sheet and re-upload.',
    };
  }

  return {
    reason: `The product image could not be saved.${urlSuffix}${raw ? ` (${raw})` : ''}`,
    suggestedFix:
      'Open the image link in a browser. If it fails, replace it with a working URL or upload the image to Media Gallery.',
  };
}

export function formatRelatedGroupFailureReason(params: {
  primaryRowNumber: number;
  primaryColumn: string;
  primaryReason: string;
}): string {
  const columnLabel = humanizeBulkUploadColumn(params.primaryColumn);
  return (
    `This row was skipped because it belongs to the same product as row ${params.primaryRowNumber}, ` +
    `which failed (${columnLabel}). ${params.primaryReason}`
  );
}
