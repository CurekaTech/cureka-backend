import { registerAs } from '@nestjs/config';
import { isAbsolute, join } from 'path';
import { ALLOWED_IMAGE_MIME_TYPES } from '@packages/storage';

export const resolveUploadDir = (dir?: string): string => {
  const value = dir ?? process.env['UPLOAD_DIR'] ?? 'uploads';
  return isAbsolute(value) ? value : join(process.cwd(), value);
};

export const resolveGcsCredentialsPath = (pathValue?: string): string | undefined => {
  if (!pathValue) return undefined;
  return isAbsolute(pathValue) ? pathValue : join(process.cwd(), pathValue);
};

export const storageConfig = registerAs('storage', () => ({
  driver: process.env['STORAGE_DRIVER'] ?? 'local',
  uploadDir: resolveUploadDir(),
  maxFileSize: parseInt(process.env['UPLOAD_MAX_FILE_SIZE'] ?? '5242880', 10),
  allowedMimeTypes: process.env['UPLOAD_ALLOWED_MIME_TYPES']
    ? process.env['UPLOAD_ALLOWED_MIME_TYPES'].split(',').map((t) => t.trim()).filter(Boolean)
    : [...ALLOWED_IMAGE_MIME_TYPES],
  gcs: {
    bucket: process.env['GCS_BUCKET_NAME'],
    credentialsPath: resolveGcsCredentialsPath(process.env['GCS_CREDENTIALS_PATH']),
    signedUrlTtlSeconds: parseInt(process.env['GCS_SIGNED_URL_TTL_SECONDS'] ?? '3600', 10),
  },
}));
