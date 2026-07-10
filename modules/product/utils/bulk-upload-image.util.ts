export const BULK_UPLOAD_VARIANT_IMAGE_COUNT = 5;
export const BULK_UPLOAD_GALLERY_IMAGE_COUNT = 5;

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
