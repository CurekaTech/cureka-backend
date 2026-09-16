import { stripQuery } from './image-bytes.util';

/** Log-safe object identity: never include signed query parameters. */
export const redactStorageUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;
  return stripQuery(value);
};

export const sanitizeErrorMessage = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/https?:\/\/[^\s]+/gi, '[redacted-url]')
    .replace(/X-Goog-[A-Za-z-]+=[^&\s]+/gi, '[redacted]')
    .slice(0, 300);
};
