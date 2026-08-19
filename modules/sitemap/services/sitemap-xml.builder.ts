import { SITEMAP_XMLNS } from '../constants/sitemap-queue.constants';
import { SitemapUrlEntry, absoluteSitemapUrl } from './sitemap-url.builder';

const LASTMOD_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/;

export const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export const unescapeXml = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

export const formatLastmod = (date: Date): string =>
  date.toISOString().replace(/\.\d{3}Z$/, 'Z');

export const buildUrlsetXml = (baseUrl: string, entries: SitemapUrlEntry[]): string => {
  const body = entries
    .map((entry) => {
      const loc = absoluteSitemapUrl(baseUrl, entry.locPath);
      const lastmod =
        entry.lastmod instanceof Date && !Number.isNaN(entry.lastmod.getTime())
          ? `\n    <lastmod>${formatLastmod(entry.lastmod)}</lastmod>`
          : '';
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmod}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SITEMAP_XMLNS}">\n${body}\n</urlset>\n`;
};

export interface SitemapIndexEntry {
  locPath: string;
  lastmod?: Date | null;
}

export const buildSitemapIndexXml = (baseUrl: string, entries: SitemapIndexEntry[]): string => {
  const body = entries
    .map((entry) => {
      const loc = absoluteSitemapUrl(baseUrl, entry.locPath);
      const lastmod =
        entry.lastmod instanceof Date && !Number.isNaN(entry.lastmod.getTime())
          ? `\n    <lastmod>${formatLastmod(entry.lastmod)}</lastmod>`
          : '';
      return `  <sitemap>\n    <loc>${escapeXml(loc)}</loc>${lastmod}\n  </sitemap>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="${SITEMAP_XMLNS}">\n${body}\n</sitemapindex>\n`;
};

export class SitemapXmlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SitemapXmlValidationError';
  }
}

const assertNoBareAmpersands = (xml: string): void => {
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/.test(xml)) {
    throw new SitemapXmlValidationError('XML contains an unescaped ampersand');
  }
};

const extractTaggedValues = (xml: string, tag: string): string[] => {
  const pattern = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g');
  const values: string[] = [];
  let match: RegExpExecArray | null = pattern.exec(xml);
  while (match) {
    values.push(match[1]?.trim() ?? '');
    match = pattern.exec(xml);
  }
  return values;
};

export const validateUrlsetXml = (xml: string, expectedLocs: string[]): void => {
  if (!xml.startsWith('<?xml')) {
    throw new SitemapXmlValidationError('URL set is missing the XML declaration');
  }
  if (!xml.includes('<urlset') || !xml.includes(`xmlns="${SITEMAP_XMLNS}"`)) {
    throw new SitemapXmlValidationError('URL set is missing a valid urlset root');
  }
  assertNoBareAmpersands(xml);

  const locs = extractTaggedValues(xml, 'loc').map(unescapeXml);
  if (locs.length !== expectedLocs.length) {
    throw new SitemapXmlValidationError(
      `URL set loc count ${locs.length} does not match expected ${expectedLocs.length}`,
    );
  }

  const unique = new Set(locs);
  if (unique.size !== locs.length) {
    throw new SitemapXmlValidationError('URL set contains duplicate loc values');
  }

  for (const loc of locs) {
    if (!/^https?:\/\//i.test(loc)) {
      throw new SitemapXmlValidationError(`Invalid loc "${loc}"`);
    }
  }

  for (const expected of expectedLocs) {
    if (!unique.has(expected)) {
      throw new SitemapXmlValidationError(`URL set is missing expected loc "${expected}"`);
    }
  }

  for (const lastmod of extractTaggedValues(xml, 'lastmod')) {
    if (!LASTMOD_PATTERN.test(lastmod)) {
      throw new SitemapXmlValidationError(`Invalid lastmod "${lastmod}"`);
    }
  }
};

export const validateSitemapIndexXml = (xml: string, expectedChildLocs: string[]): void => {
  if (!xml.startsWith('<?xml')) {
    throw new SitemapXmlValidationError('Sitemap index is missing the XML declaration');
  }
  if (!xml.includes('<sitemapindex') || !xml.includes(`xmlns="${SITEMAP_XMLNS}"`)) {
    throw new SitemapXmlValidationError('Sitemap index is missing a valid sitemapindex root');
  }
  assertNoBareAmpersands(xml);

  const locs = extractTaggedValues(xml, 'loc').map(unescapeXml);
  if (locs.length !== expectedChildLocs.length) {
    throw new SitemapXmlValidationError(
      `Index loc count ${locs.length} does not match expected ${expectedChildLocs.length}`,
    );
  }

  const unique = new Set(locs);
  if (unique.size !== locs.length) {
    throw new SitemapXmlValidationError('Sitemap index contains duplicate loc values');
  }

  for (const expected of expectedChildLocs) {
    if (!unique.has(expected)) {
      throw new SitemapXmlValidationError(`Sitemap index is missing expected loc "${expected}"`);
    }
  }
};
