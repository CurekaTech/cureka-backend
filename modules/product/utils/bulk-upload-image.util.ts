import { isAllowedPublicMediaKey, normalizeStorageKey } from '@packages/storage';
import { normalizeOptionalBulkAltText } from './product-media-alt-text.util';

export const BULK_UPLOAD_VARIANT_IMAGE_COUNT = 5;
export const BULK_UPLOAD_GALLERY_IMAGE_COUNT = 6;
/** Sample template shows this many common_media columns; upload accepts any N. */
export const BULK_UPLOAD_COMMON_MEDIA_SAMPLE_COUNT = 6;

export const isRemoteImageUrl = (value: string): boolean =>
  /^https?:\/\//i.test(value.trim());

const LIVE_CUREKA_ORIGIN_RE = /^https?:\/\/(?:www\.)?cureka\.com/i;
const PUBLIC_MEDIA_PATH_RE = /\/public\/media\//i;
export const LEGACY_CUREKA_ORIGIN = 'https://legacy.cureka.com';

/**
 * Already-uploaded file served by GET /api/v1/public/media/{key}.
 * Returns the bucket key (for example gallery/uuid.png), or null for WordPress and other hosts.
 */
export const existingPublicMediaStorageKey = (url: string): string | null => {
  const trimmed = url.trim();
  if (!isRemoteImageUrl(trimmed) || !PUBLIC_MEDIA_PATH_RE.test(trimmed)) {
    return null;
  }
  const key = normalizeStorageKey(trimmed);
  if (!key || !isAllowedPublicMediaKey(key)) return null;
  return key;
};

/**
 * WooCommerce / bulk sheets still list www.cureka.com image URLs.
 * Those files now live on the temporary WordPress host. Rewrite the host only.
 * Our public media URLs, non-Cureka URLs, and GCS keys are left unchanged.
 */
export const toLegacyCurekaImageUrl = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (PUBLIC_MEDIA_PATH_RE.test(trimmed)) return trimmed;
  if (/^https?:\/\/legacy\.cureka\.com/i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }
  return trimmed.replace(LIVE_CUREKA_ORIGIN_RE, LEGACY_CUREKA_ORIGIN);
};

export const isStorageImageKey = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed || isRemoteImageUrl(trimmed)) return false;
  const key = normalizeStorageKey(trimmed);
  return Boolean(key && isAllowedPublicMediaKey(key));
};

/**
 * Sheet cell that already points at a stored file.
 * Public media URLs (gallery, images, banners, …) and harvest-cache hits
 * are reused as-is. WordPress URLs return null so the caller can download them.
 */
export const reuseStoredBulkUploadImageKey = (
  url: string,
  harvestBySourceUrl?: ReadonlyMap<string, string>,
): string | null => {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const publicKey = existingPublicMediaStorageKey(trimmed);
  if (publicKey) return publicKey;

  if (!isRemoteImageUrl(trimmed)) {
    const key = normalizeStorageKey(trimmed);
    if (key && isAllowedPublicMediaKey(key)) return key;
  }

  if (!harvestBySourceUrl?.size || !isRemoteImageUrl(trimmed)) return null;

  const candidates = new Set<string>([trimmed, toLegacyCurekaImageUrl(trimmed)]);
  if (/^https?:\/\/legacy\.cureka\.com/i.test(trimmed)) {
    candidates.add(trimmed.replace(/^https?:\/\/legacy\.cureka\.com/i, 'https://www.cureka.com'));
  }

  for (const candidate of candidates) {
    const stored = harvestBySourceUrl.get(candidate)?.trim();
    if (!stored) continue;
    const key = normalizeStorageKey(stored);
    if (key && isAllowedPublicMediaKey(key)) return key;
  }

  return null;
};

/** Public http(s) URL or already-uploaded storage key usable as media[].url. */
export const isBulkUploadImageUrlValue = (value: string): boolean =>
  isRemoteImageUrl(value) || isStorageImageKey(value);

export interface IBulkUploadImageInput {
  filename?: string;
  url?: string;
  isPrimary: boolean;
  sortOrder: number;
  /** Set only when the matching alt column has text. Blank cells are omitted. */
  altText?: string;
}

export type BulkUploadImageGetVal = (columnName: string) => string;

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

const pushResolvedImage = (
  images: IBulkUploadImageInput[],
  filename?: string,
  url?: string,
  altText?: string,
): void => {
  const resolved = resolveBulkUploadImageInput(filename, url);
  if (!resolved) return;
  const normalizedAlt = normalizeOptionalBulkAltText(altText);

  images.push({
    ...resolved,
    isPrimary: false,
    sortOrder: images.length,
    ...(normalizedAlt !== undefined ? { altText: normalizedAlt } : {}),
  });
};

/**
 * Removes empty image slots and assigns contiguous primary/sort-order values.
 * The first resolvable image becomes primary regardless of its source column.
 */
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

/**
 * Reads Primary Image + Gallery Image 2..N columns in sheet order.
 * First non-empty slot becomes primary (sortOrder 0); gaps are removed.
 * Video columns are included when present.
 */
export const parsePrimaryAndGalleryImages = (
  getVal: BulkUploadImageGetVal,
  getFirstAvailable: (names: string[]) => string,
): IBulkUploadImageInput[] => {
  const images: IBulkUploadImageInput[] = [];

  pushResolvedImage(
    images,
    getFirstAvailable(['primary image filename', 'primary_image_filename', 'primary image', 'primary image path']),
    getFirstAvailable(['primary image url', 'primary_image_url']),
    getFirstAvailable(['primary image alt', 'primary_image_alt']),
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

    const altColumns =
      index === 2
        ? [
            'gallery image 2 (video) alt',
            'gallery image 2 video alt',
            'gallery_image_2_video_alt',
            'gallery image 2 alt',
            'gallery_image_2_alt',
          ]
        : [`gallery image ${index} alt`, `gallery_image_${index}_alt`];
    pushResolvedImage(
      images,
      getFirstAvailable(nameColumns),
      getFirstAvailable(urlColumns),
      getFirstAvailable(altColumns),
    );
  }

  void getVal;
  return compactBulkUploadImageSequence(images);
};

/**
 * Reads only explicit video columns from the bulk sheet.
 */
export const parseVideoImages = (
  getVal: BulkUploadImageGetVal,
  getFirstAvailable: (names: string[]) => string,
): IBulkUploadImageInput[] => {
  const images: IBulkUploadImageInput[] = [];

  pushResolvedImage(
    images,
    getFirstAvailable([
      'gallery image 2 (video)',
      'gallery_image_2_video',
      'gallery image 2 video',
    ]),
    getFirstAvailable([
      'gallery image 2 (video) url',
      'gallery_image_2_video_url',
      'gallery image 2 video url',
    ]),
    getFirstAvailable([
      'gallery image 2 (video) alt',
      'gallery image 2 video alt',
      'gallery_image_2_video_alt',
    ]),
  );

  void getVal;
  return compactBulkUploadImageSequence(images);
};

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

/**
 * Reads common_media_1..N (+ optional name, required URL) from a row.
 * Template ships with 6 sample columns; any higher index present in the sheet is accepted.
 * Entries without a URL are skipped (name-only is not enough).
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
      getVal(`common_media_${index}_alt`),
    );
  }

  return compactBulkUploadImageSequence(images);
};
