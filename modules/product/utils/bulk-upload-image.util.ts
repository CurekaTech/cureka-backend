export const BULK_UPLOAD_VARIANT_IMAGE_COUNT = 5;
export const BULK_UPLOAD_GALLERY_IMAGE_COUNT = 6;
/** Sample template shows this many common_media columns; upload accepts any N. */
export const BULK_UPLOAD_COMMON_MEDIA_SAMPLE_COUNT = 6;

export const isRemoteImageUrl = (value: string): boolean =>
  /^https?:\/\//i.test(value.trim());

export interface IBulkUploadImageInput {
  filename?: string;
  url?: string;
  isPrimary: boolean;
  sortOrder: number;
}

/** Prefer keeping both when present so URL download can fall back to gallery/ZIP filename. */
export const resolveBulkUploadImageInput = (
  filename?: string,
  url?: string,
): Pick<IBulkUploadImageInput, 'filename' | 'url'> | null => {
  const normalizedUrl = url?.trim() || undefined;
  const normalizedFilename = filename?.trim() || undefined;

  if (!normalizedUrl && !normalizedFilename) {
    return null;
  }

  return {
    ...(normalizedUrl ? { url: normalizedUrl } : {}),
    ...(normalizedFilename ? { filename: normalizedFilename } : {}),
  };
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

/** Matches common_media_1 / common_media_1_url after header normalization. */
export const isCommonMediaBulkUploadColumn = (normalizedHeader: string): boolean =>
  /^common_media_\d+(_url)?$/.test(normalizedHeader);

export const buildCommonMediaTemplateHeaders = (
  count = BULK_UPLOAD_COMMON_MEDIA_SAMPLE_COUNT,
): string[] => {
  const headers: string[] = [];
  for (let index = 1; index <= count; index += 1) {
    headers.push(`common_media_${index}`, `common_media_${index}_url`);
  }
  return headers;
};

/** Re-assigns sortOrder 0..N and marks only the first image as primary. */
export const compactBulkUploadImageSequence = <T extends IBulkUploadImageInput>(
  images: T[],
): T[] =>
  images
    .filter((image) => isBulkUploadImagePresent(image))
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((image, index) => ({
      ...image,
      isPrimary: index === 0,
      sortOrder: index,
    }));

export type BulkUploadImageGetVal = (columnName: string) => string;

const pushResolvedImage = (
  images: IBulkUploadImageInput[],
  filename?: string,
  url?: string,
): void => {
  const resolved = resolveBulkUploadImageInput(filename, url);
  if (!resolved) return;
  images.push({
    ...resolved,
    isPrimary: false,
    sortOrder: images.length,
  });
};

/**
 * Reads Primary Image + Gallery Image 2..N columns in sheet order.
 * First non-empty slot becomes primary (sortOrder 0); gaps are removed.
 */
export const parsePrimaryAndGalleryImages = (
  getVal: BulkUploadImageGetVal,
  getFirstAvailable: (names: string[]) => string,
): IBulkUploadImageInput[] => {
  const images: IBulkUploadImageInput[] = [];

  pushResolvedImage(
    images,
    getFirstAvailable(['primary image filename', 'primary_image_filename']),
    getFirstAvailable(['primary image url', 'primary_image_url']),
  );

  for (let index = 2; index <= BULK_UPLOAD_GALLERY_IMAGE_COUNT; index += 1) {
    const nameColumns =
      index === 2
        ? ['gallery image 2', 'gallery image 2 (video)', 'gallery_image_2', 'gallery_image_2_video']
        : [`gallery image ${index}`, `gallery_image_${index}`];
    const urlColumns =
      index === 2
        ? [
            'gallery image 2 url',
            'gallery image 2 (video) url',
            'gallery_image_2_url',
            'gallery_image_2_video_url',
          ]
        : [`gallery image ${index} url`, `gallery_image_${index}_url`];

    pushResolvedImage(images, getFirstAvailable(nameColumns), getFirstAvailable(urlColumns));
  }

  return compactBulkUploadImageSequence(images);
};

/**
 * Reads common_media_1..N (+ optional _url) from a row in column-index order.
 * Template ships with 6 sample columns; any higher index present in the sheet is accepted.
 */
export const parseCommonMediaColumns = (
  getVal: (columnName: string) => string,
  headerMap: Map<string, number>,
): IBulkUploadImageInput[] => {
  const indexes = new Set<number>();

  for (const header of headerMap.keys()) {
    const snake = header.match(/^common_media_(\d+)(_url)?$/);
    if (snake) {
      indexes.add(parseInt(snake[1], 10));
    }
  }

  const sortedIndexes = [...indexes].sort((left, right) => left - right);
  const images: IBulkUploadImageInput[] = [];

  for (const index of sortedIndexes) {
    pushResolvedImage(
      images,
      getVal(`common_media_${index}`),
      getVal(`common_media_${index}_url`),
    );
  }

  return compactBulkUploadImageSequence(images);
};
