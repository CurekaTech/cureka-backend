export const SITEMAP_GROUPS = [
  'static',
  'products',
  'categories',
  'brands',
  'health-concerns',
  'wellness-goals',
  'collections',
  'blogs',
  'support',
  'cms',
] as const;

export type SitemapGroup = (typeof SITEMAP_GROUPS)[number];

export const isSitemapGroup = (value: string): value is SitemapGroup =>
  (SITEMAP_GROUPS as readonly string[]).includes(value);

/** Live object key relative to SITEMAP_STORAGE_PATH, excluding the index. */
export const sitemapGroupLivePrefix = (group: SitemapGroup): string => {
  if (group === 'static') return 'static.xml';
  if (group === 'products') return 'products/';
  return `${group}.xml`;
};

export const sitemapGroupPublicPath = (group: SitemapGroup, shardIndex?: number): string => {
  if (group === 'static') return '/sitemaps/static.xml';
  if (group === 'products') {
    const shard = shardIndex ?? 1;
    return `/sitemaps/products/products-${shard}.xml`;
  }
  return `/sitemaps/${group}.xml`;
};

export const sitemapGroupLivePath = (group: SitemapGroup, shardIndex?: number): string => {
  if (group === 'static') return 'static.xml';
  if (group === 'products') {
    const shard = shardIndex ?? 1;
    return `products/products-${shard}.xml`;
  }
  return `${group}.xml`;
};

/** Nested keys from the first publish shape, still served if present. */
export const sitemapGroupLegacyLivePath = (group: SitemapGroup): string | null => {
  if (group === 'static' || group === 'products') return null;
  return `${group}/${group}.xml`;
};

/** Map a live object key (relative to sitemaps/) to the public storefront path. */
export const liveKeyToPublicPath = (relativePath: string): string | null => {
  const path = relativePath.replace(/^\/+/, '');
  if (!path.endsWith('.xml') || path === 'sitemap.xml' || path.includes('.staging')) return null;
  const product = path.match(/^products\/products-(\d+)\.xml$/);
  if (product) return `/sitemaps/products/products-${product[1]}.xml`;
  if (path === 'static.xml') return '/sitemaps/static.xml';
  const nested = path.match(/^([a-z0-9-]+)\/\1\.xml$/i);
  if (nested) return `/sitemaps/${nested[1]}.xml`;
  if (/^[a-z0-9-]+\.xml$/i.test(path)) return `/sitemaps/${path}`;
  return null;
};
