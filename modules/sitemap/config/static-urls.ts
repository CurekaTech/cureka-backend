export interface SitemapStaticUrl {
  path: string;
}

/** Hub pages that are not CMS-driven. Policy/about URLs live in cms.xml. */
export const SITEMAP_STATIC_URLS: readonly SitemapStaticUrl[] = [
  { path: '/' },
  { path: '/categories' },
  { path: '/product-brands' },
  { path: '/health-concerns' },
  { path: '/wellness-goals' },
  { path: '/bundles' },
  { path: '/blog' },
  { path: '/support' },
  { path: '/experts' },
  { path: '/expert-talks' },
  { path: '/watch-and-shop' },
  { path: '/become-seller' },
];
