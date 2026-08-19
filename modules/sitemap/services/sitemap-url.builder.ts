import {
  buildCategoryPermalink,
  buildProductPermalink,
} from '@modules/public/utils/category-permalink.util';
import { cmsSlugToStorefrontPath } from '../config/cms-url.map';

export interface SitemapUrlEntry {
  locPath: string;
  lastmod?: Date | null;
}

export const slugifyForUrl = (value: string): string =>
  value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

export const toStorefrontPath = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsed = new URL(trimmed);
      const pathname = parsed.pathname || '/';
      return pathname === '/' ? '/' : pathname.replace(/\/+$/, '') || '/';
    }
  } catch {
    return null;
  }

  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  if (withSlash === '/') return '/';
  return withSlash.replace(/\/+$/, '') || '/';
};

export const absoluteSitemapUrl = (baseUrl: string, locPath: string): string => {
  const origin = baseUrl.replace(/\/+$/, '');
  if (locPath === '/') return `${origin}/`;
  const path = locPath.startsWith('/') ? locPath : `/${locPath}`;
  return `${origin}${path}`;
};

export interface ProductLocInput {
  slug?: string | null;
  productPageUrl?: string | null;
  singleProductUrl?: string | null;
  categorySlugPath: string[];
}

const slugPermalink = (input: ProductLocInput): string | null => {
  const slug = input.slug?.trim();
  if (!slug) return null;
  return buildProductPermalink(input.categorySlugPath, slug);
};

/**
 * Unique public locs for one product.
 * - `product_page_url` when present (legacy/canonical storefront path)
 * - `/shop/{category-path}/{slug}` when slug is present
 * Many products have no product_page_url; those emit the slug permalink only.
 */
export const buildProductLocPaths = (input: ProductLocInput): string[] => {
  const paths: string[] = [];
  const seen = new Set<string>();
  const add = (path: string | null | undefined): void => {
    if (!path || path === '/' || seen.has(path)) return;
    seen.add(path);
    paths.push(path);
  };

  add(toStorefrontPath(input.productPageUrl));
  add(slugPermalink(input));
  if (!paths.length) {
    add(toStorefrontPath(input.singleProductUrl));
  }
  return paths;
};

export const buildProductLocPath = (input: ProductLocInput): string | null =>
  buildProductLocPaths(input)[0] ?? null;

export const buildCategoryLocPath = (slugPath: string[]): string | null => {
  const cleaned = slugPath.map((slug) => slug.trim()).filter(Boolean);
  if (!cleaned.length) return null;
  return buildCategoryPermalink(cleaned);
};

export const buildBrandLocPath = (slug: string | null | undefined): string | null => {
  const value = slug?.trim();
  if (!value) return null;
  return `/product-brands/${value}`;
};

export const buildHealthConcernLocPath = (slug: string | null | undefined): string | null => {
  const value = slug?.trim();
  if (!value) return null;
  const safe = slugifyForUrl(value);
  if (!safe) return null;
  return `/health-concerns/${safe}`;
};

export const buildWellnessGoalLocPath = (name: string | null | undefined): string | null => {
  const safe = slugifyForUrl(name ?? '');
  if (!safe) return null;
  return `/wellness-goals/${safe}`;
};

export const buildCollectionLocPath = (slug: string | null | undefined): string | null => {
  const value = slug?.trim();
  if (!value) return null;
  return `/collections/${value}`;
};

export const buildBlogLocPath = (slug: string | null | undefined): string | null => {
  const value = slug?.trim();
  if (!value) return null;
  return `/${value}`;
};

export const buildSupportLocPath = (slug: string | null | undefined): string | null => {
  const value = slug?.trim();
  if (!value) return null;
  return `/support/articles/${value}`;
};

export const buildCmsLocPath = (slug: string | null | undefined): string | null => {
  if (!slug?.trim()) return null;
  return cmsSlugToStorefrontPath(slug);
};

export const dedupeUrlEntries = (entries: SitemapUrlEntry[]): SitemapUrlEntry[] => {
  const seen = new Set<string>();
  const result: SitemapUrlEntry[] = [];
  for (const entry of entries) {
    if (!entry.locPath || seen.has(entry.locPath)) continue;
    seen.add(entry.locPath);
    result.push(entry);
  }
  return result;
};

export const splitUrlEntries = (
  entries: SitemapUrlEntry[],
  maxUrlsPerFile: number,
): SitemapUrlEntry[][] => {
  const size = Math.max(1, maxUrlsPerFile);
  if (!entries.length) return [];
  const chunks: SitemapUrlEntry[][] = [];
  for (let index = 0; index < entries.length; index += size) {
    chunks.push(entries.slice(index, index + size));
  }
  return chunks;
};
