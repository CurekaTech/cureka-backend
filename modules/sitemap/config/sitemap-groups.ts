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
  return `${group}/${group}.xml`;
};

export const sitemapGroupPublicPath = (group: SitemapGroup, shardIndex?: number): string => {
  if (group === 'static') return '/sitemaps/static.xml';
  if (group === 'products') {
    const shard = shardIndex ?? 1;
    return `/sitemaps/products/products-${shard}.xml`;
  }
  return `/sitemaps/${group}/${group}.xml`;
};

export const sitemapGroupLivePath = (group: SitemapGroup, shardIndex?: number): string => {
  if (group === 'static') return 'static.xml';
  if (group === 'products') {
    const shard = shardIndex ?? 1;
    return `products/products-${shard}.xml`;
  }
  return `${group}/${group}.xml`;
};
