export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

/** Optional post-upload hook implemented by the image pipeline. */
export const STORAGE_UPLOAD_HOOK = Symbol('STORAGE_UPLOAD_HOOK');

export interface IStorageUploadHook {
  onStoredObject(input: {
    key: string;
    mimetype: string;
    size: number;
  }): void | Promise<void>;
}

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/x-ms-bmp',
  'application/pdf',
] as const;

export const ALLOWED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/mpeg',
  'video/ogg',
  'video/x-matroska',
  'video/3gpp',
  'video/x-flv',
] as const;

/** Spreadsheet / product-sheet uploads (.xlsx and .csv, plus common browser MIME aliases). */
export const ALLOWED_SPREADSHEET_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // some browsers / Excel for csv or legacy sheets
  'text/csv',
  'application/csv',
  'text/comma-separated-values',
] as const;

export const ALLOWED_UPLOAD_MIME_TYPES = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  ...ALLOWED_VIDEO_MIME_TYPES,
  ...ALLOWED_SPREADSHEET_MIME_TYPES,
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];
export type AllowedVideoMimeType = (typeof ALLOWED_VIDEO_MIME_TYPES)[number];
export type AllowedSpreadsheetMimeType = (typeof ALLOWED_SPREADSHEET_MIME_TYPES)[number];
export type AllowedUploadMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];
