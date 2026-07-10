export const BULK_UPLOAD_VARIANT_IMAGE_COUNT = 5;
export const BULK_UPLOAD_GALLERY_IMAGE_COUNT = 5;
/** Sample template shows this many common_media columns; upload accepts any N. */
export const BULK_UPLOAD_COMMON_MEDIA_SAMPLE_COUNT = 5;

export const isRemoteImageUrl = (value: string): boolean =>
  /^https?:\/\//i.test(value.trim());

export interface IBulkUploadImageInput {
  filename?: string;
  url?: string;
  isPrimary?: boolean;
  sortOrder: number;
}

/** URL takes priority over gallery/ZIP filename when both are provided. */
export const resolveBulkUploadImageInput = (
  filename?: string,
  url?: string,
): Pick<IBulkUploadImageInput, 'filename' | 'url'> | null => {
  const normalizedUrl = url?.trim();
  if (normalizedUrl) {
    return { url: normalizedUrl };
  }

  const normalizedFilename = filename?.trim();
  if (normalizedFilename) {
    return { filename: normalizedFilename };
  }

  return null;
};

export const isBulkUploadImagePresent = (
  image: Pick<IBulkUploadImageInput, 'filename' | 'url'>,
): boolean => Boolean(image.url?.trim() || image.filename?.trim());

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
 * Reads common_media_1..N (+ optional _url) from a row.
 * Template ships with 5 sample columns; any higher index present in the sheet is accepted.
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
