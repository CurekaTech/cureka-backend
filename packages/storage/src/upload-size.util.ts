import { Transform, type Readable } from 'stream';
import { ALLOWED_VIDEO_MIME_TYPES } from './storage.constants';

/** 5 MB — images and PDFs (product images from WC/CDN often exceed 1 MB) */
export const DEFAULT_MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024;

/** 20 MB — videos */
export const DEFAULT_MAX_VIDEO_FILE_SIZE = 20 * 1024 * 1024;

/** 40 MB — product bulk-upload spreadsheets */
export const DEFAULT_MAX_BULK_FILE_SIZE = 40 * 1024 * 1024;

export class UploadSizeLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadSizeLimitExceededError';
  }
}

export const isLargePayloadMimeType = (mimetype: string): boolean =>
  mimetype.startsWith('video/') ||
  (ALLOWED_VIDEO_MIME_TYPES as readonly string[]).includes(mimetype) ||
  mimetype === 'application/pdf';

export const isBulkSheetMimeType = (mimetype: string): boolean =>
  [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
  ].includes(mimetype);

export const resolveMaxFileSizeForMime = (
  mimetype: string,
  limits?: {
    maxImageFileSize?: number;
    maxVideoFileSize?: number;
    maxBulkFileSize?: number;
  },
): number =>
  isBulkSheetMimeType(mimetype)
    ? (limits?.maxBulkFileSize ?? DEFAULT_MAX_BULK_FILE_SIZE)
    : isLargePayloadMimeType(mimetype)
    ? (limits?.maxVideoFileSize ?? DEFAULT_MAX_VIDEO_FILE_SIZE)
    : (limits?.maxImageFileSize ?? DEFAULT_MAX_IMAGE_FILE_SIZE);

export const formatUploadSizeLimit = (bytes: number): string => {
  if (bytes % (1024 * 1024) === 0) {
    return `${bytes / (1024 * 1024)} MB`;
  }
  if (bytes % 1024 === 0) {
    return `${bytes / 1024} KB`;
  }
  return `${bytes} bytes`;
};

export const limitUploadStreamSize = (
  source: Readable,
  maxBytes: number,
  mimetype: string,
): Readable => {
  let bytes = 0;

  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        callback(
          new UploadSizeLimitExceededError(
            `File exceeds maximum allowed size of ${formatUploadSizeLimit(maxBytes)} for ${mimetype}`,
          ),
        );
        return;
      }
      callback(null, chunk);
    },
  });

  source.on('error', (error) => limiter.destroy(error));
  limiter.on('error', () => source.destroy());

  source.pipe(limiter);
  return limiter;
};
