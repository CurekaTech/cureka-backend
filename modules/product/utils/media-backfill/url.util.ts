import { isAbsolute, resolve } from 'path';
import { LEGACY_ORIGIN } from './types';

const LIVE_ORIGIN_RE = /^https?:\/\/(?:www\.)?cureka\.com(?=\/|$)/i;
const LEGACY_ORIGIN_RE = /^https?:\/\/legacy\.cureka\.com(?=\/|$)/i;

export const absolutePath = (path: string, cwd = process.cwd()): string =>
  isAbsolute(path) ? path : resolve(cwd, path);

/** Origin-safe rewrite: only www.cureka.com / cureka.com → legacy.cureka.com */
export const rewriteToLegacyOrigin = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (LEGACY_ORIGIN_RE.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }
  return trimmed.replace(LIVE_ORIGIN_RE, LEGACY_ORIGIN);
};

export const isMalformedLegacyUrl = (url: string): boolean => {
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (!/^https?:\/\//i.test(trimmed)) return true;
  // Truncated Excel values like https://legacy.cureka.com/wp-
  if (/\/wp-?$/i.test(trimmed) || /\/wp-content\/?$/i.test(trimmed)) return true;
  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname) return true;
    if (!parsed.pathname || parsed.pathname === '/') return true;
    return false;
  } catch {
    return true;
  }
};

export const basenameFromUrl = (url: string): string => {
  try {
    const clean = url.split('?')[0].split('#')[0];
    const name = clean.split('/').pop() ?? '';
    return decodeURIComponent(name).trim();
  } catch {
    return '';
  }
};

export const basenameKey = (name: string): string => {
  try {
    return decodeURIComponent(name).trim().toLowerCase();
  } catch {
    return name.trim().toLowerCase();
  }
};

export const basenameFromStorageKey = (key: string | null | undefined): string => {
  if (!key) return '';
  return basenameKey(key.split('/').pop() ?? '');
};

export const buildLegacyUrlFromRelativePath = (relativePath: string): string => {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return `${LEGACY_ORIGIN}/${normalized}`;
};

export const isPrivateOrLocalHostname = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (host.endsWith('.local')) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  return false;
};
