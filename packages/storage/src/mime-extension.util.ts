import { extname } from 'path';

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-msvideo': '.avi',
  'video/mpeg': '.mpeg',
};

export const resolveUploadExtension = (mimetype: string, originalFilename: string): string => {
  const fromMime = MIME_TO_EXTENSION[mimetype];
  if (fromMime) return fromMime;

  const fromName = extname(originalFilename).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.mp4', '.webm', '.mov', '.avi', '.mpeg', '.mpg'].includes(fromName)) {
    if (fromName === '.jpeg') return '.jpg';
    if (fromName === '.mpg') return '.mpeg';
    return fromName;
  }

  return '.bin';
};
