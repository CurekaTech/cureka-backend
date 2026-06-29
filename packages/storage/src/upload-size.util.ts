import { Transform, type Readable } from 'stream';
import { ALLOWED_VIDEO_MIME_TYPES } from './storage.constants';

/** 1 MB — images and PDFs */
export const DEFAULT_MAX_IMAGE_FILE_SIZE = 1 * 1024 * 1024;

/** 20 MB — videos */
export const DEFAULT_MAX_VIDEO_FILE_SIZE = 20 * 1024 * 1024;

export class UploadSizeLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadSizeLimitExceededError';
  }
}

export const isVideoMimeType = (mimetype: string): boolean =>
  (ALLOWED_VIDEO_MIME_TYPES as readonly string[]).includes(mimetype);

export const resolveMaxFileSizeForMime = (
  mimetype: string,
  limits?: { maxImageFileSize?: number; maxVideoFileSize?: number },
): number =>
  isVideoMimeType(mimetype)
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
