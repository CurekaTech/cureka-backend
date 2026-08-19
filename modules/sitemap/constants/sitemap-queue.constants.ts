export const SITEMAP_XMLNS = 'http://www.sitemaps.org/schemas/sitemap/0.9';

export const SITEMAP_CACHE_CONTROL =
  'public, max-age=300, s-maxage=300, stale-while-revalidate=3600';

export const SITEMAP_CONTENT_TYPE = 'application/xml; charset=utf-8';

export const SITEMAP_JOB_NAMES = {
  GENERATE_ALL: 'generate-all',
  GENERATE_GROUP: 'generate-group',
  SAFETY_REBUILD: 'safety-rebuild',
} as const;

export type SitemapJobName = (typeof SITEMAP_JOB_NAMES)[keyof typeof SITEMAP_JOB_NAMES];

export interface GenerateGroupJobData {
  group: string;
}

export const SITEMAP_DIRTY_KEY_PREFIX = 'sitemap:dirty:';
export const SITEMAP_DIRTY_SET_KEY = 'sitemap:dirty:groups';
