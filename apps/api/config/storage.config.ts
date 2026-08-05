import { registerAs } from '@nestjs/config';
import { isAbsolute, join } from 'path';
import {
  ALLOWED_SPREADSHEET_MIME_TYPES,
  ALLOWED_UPLOAD_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
} from '@packages/storage';

export const resolveUploadDir = (dir?: string): string => {
  const value = dir ?? process.env['UPLOAD_DIR'] ?? 'uploads';
  return isAbsolute(value) ? value : join(process.cwd(), value);
};

export const resolveGcsCredentialsPath = (pathValue?: string): string | undefined => {
  if (!pathValue) return undefined;
  return isAbsolute(pathValue) ? pathValue : join(process.cwd(), pathValue);
};

export const storageConfig = registerAs('storage', () => {
  const envMimeTypes = process.env['UPLOAD_ALLOWED_MIME_TYPES']
    ? process.env['UPLOAD_ALLOWED_MIME_TYPES']
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const allowedMimeTypes = [
    ...new Set([
      ...(envMimeTypes.length > 0 ? envMimeTypes : [...ALLOWED_UPLOAD_MIME_TYPES]),
      ...ALLOWED_VIDEO_MIME_TYPES,
      // Always allow product sheets (.xlsx + .csv), even when env MIME list is set.
      ...ALLOWED_SPREADSHEET_MIME_TYPES,
    ]),
  ];

  return {
    driver: process.env['STORAGE_DRIVER'] ?? 'local',
    uploadDir: resolveUploadDir(),
    maxImageFileSize: parseInt(process.env['UPLOAD_MAX_IMAGE_FILE_SIZE'] ?? '5242880', 10),
    maxVideoFileSize: parseInt(process.env['UPLOAD_MAX_VIDEO_FILE_SIZE'] ?? '20971520', 10),
    maxBulkFileSize: parseInt(
      process.env['PRODUCT_BULK_UPLOAD_MAX_SHEET_SIZE'] ?? '41943040',
      10,
    ),
    // Separate higher limit for images downloaded from external URLs during bulk upload.
    // Product catalog images (WooCommerce CDN etc.) can exceed the standard upload limit.
    maxBulkImageSize: parseInt(
      process.env['PRODUCT_BULK_UPLOAD_MAX_IMAGE_SIZE'] ?? String(5 * 1024 * 1024),
      10,
    ),
    allowedMimeTypes,
    gcs: {
      bucket: process.env['GCS_BUCKET_NAME'],
      credentialsPath: resolveGcsCredentialsPath(process.env['GCS_CREDENTIALS_PATH']),
      signedUrlTtlSeconds: parseInt(process.env['GCS_SIGNED_URL_TTL_SECONDS'] ?? '86400', 10),
    },
  };
});
