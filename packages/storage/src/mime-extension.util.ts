import { extname } from 'path';

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export const resolveUploadExtension = (mimetype: string, originalFilename: string): string => {
  const fromMime = MIME_TO_EXTENSION[mimetype];
  if (fromMime) return fromMime;

  const fromName = extname(originalFilename).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(fromName)) {
    return fromName === '.jpeg' ? '.jpg' : fromName;
  }

  return '.bin';
};
