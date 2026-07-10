export const BULK_UPLOAD_VARIANT_IMAGE_COUNT = 5;
export const BULK_UPLOAD_GALLERY_IMAGE_COUNT = 5;
/** Sample template shows this many common_media columns; upload accepts any N. */
export const BULK_UPLOAD_COMMON_MEDIA_SAMPLE_COUNT = 5;

export const isRemoteImageUrl = (value: string): boolean =>
  /^https?:\/\//i.test(value.trim());

export const isStorageImageKey = (value: string): boolean =>
  /^(images|videos)\//i.test(value.trim());

/** Public http(s) URL or already-uploaded storage key usable as media[].url. */
export const isBulkUploadImageUrlValue = (value: string): boolean =>
  isRemoteImageUrl(value) || isStorageImageKey(value);

export interface IBulkUploadImageInput {
  filename?: string;
  url?: string;
  isPrimary?: boolean;
  sortOrder: number;
}

/**
 * Media fields require a URL (public http(s) or storage key).
 * Filename/name is optional (gallery/ZIP hint only).
 * If the name column holds a URL/key and the URL column is empty, it is treated as the URL.
 */
export const resolveBulkUploadImageInput = (
  filename?: string,
  url?: string,
): Pick<IBulkUploadImageInput, 'filename' | 'url'> | null => {
  let normalizedUrl = url?.trim() || undefined;
  let normalizedFilename = filename?.trim() || undefined;

  if (
    !normalizedUrl &&
    normalizedFilename &&
    isBulkUploadImageUrlValue(normalizedFilename)
  ) {
    normalizedUrl = normalizedFilename;
    normalizedFilename = undefined;
  }

  // URL is required for every media field
  if (!normalizedUrl) {
    return null;
  }

  return {
    url: normalizedUrl,
    ...(normalizedFilename ? { filename: normalizedFilename } : {}),
  };
};

export const isBulkUploadImagePresent = (
  image: Pick<IBulkUploadImageInput, 'filename' | 'url'>,
): boolean => Boolean(image.url?.trim());

export const resolveBulkUploadSizeChart = (
  url?: string,
  filename?: string,
): string | undefined => {
  const normalizedUrl = url?.trim();
  if (normalizedUrl) {
    return normalizedUrl;
  }

  const normalizedFilename = filename?.trim();
  return normalizedFilename || undefined;
};

export const isBulkUploadSizeChartResolvableWithoutGallery = (value: string): boolean =>
  isRemoteImageUrl(value) || /^images\//i.test(value.trim());

/** Matches common_media_1 / common_media_1_url / "common media 1" / "common media 1 url". */
export const isCommonMediaBulkUploadColumn = (normalizedHeader: string): boolean =>
  /^common_media_\d+(_url)?$/.test(normalizedHeader) ||
  /^common media \d+( url)?$/.test(normalizedHeader);

export const buildCommonMediaTemplateHeaders = (
  count = BULK_UPLOAD_COMMON_MEDIA_SAMPLE_COUNT,
): string[] => {
  const headers: string[] = [];
  for (let index = 1; index <= count; index += 1) {
    headers.push(`common_media_${index}`, `common_media_${index}_url`);
  }
  return headers;
};

/**
 * Reads common_media_1..N (+ optional name, required URL) from a row.
 * Template ships with 5 sample columns; any higher index present in the sheet is accepted.
 * Entries without a URL are skipped (name-only is not enough).
 */
export const parseCommonMediaColumns = (
  getVal: (columnName: string) => string,
  headerMap: Map<string, number>,
): Array<{ filename?: string; url?: string; isPrimary: boolean; sortOrder: number }> => {
  const indexes = new Set<number>();

  for (const header of headerMap.keys()) {
    const snake = header.match(/^common_media_(\d+)(_url)?$/);
    if (snake) {
      indexes.add(parseInt(snake[1], 10));
      continue;
    }
    const spaced = header.match(/^common media (\d+)( url)?$/);
    if (spaced) {
      indexes.add(parseInt(spaced[1], 10));
    }
  }

  const sortedIndexes = [...indexes].sort((a, b) => a - b);
  const images: Array<{ filename?: string; url?: string; isPrimary: boolean; sortOrder: number }> =
    [];

  for (const index of sortedIndexes) {
    const resolved = resolveBulkUploadImageInput(
      getVal(`common_media_${index}`) || getVal(`common media ${index}`),
      getVal(`common_media_${index}_url`) || getVal(`common media ${index} url`),
    );
    if (!resolved) continue;
    images.push({
      ...resolved,
      isPrimary: images.length === 0,
      sortOrder: images.length,
    });
  }

  return images;
};
