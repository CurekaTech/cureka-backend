/**
 * Centralized cache key factory.
 * Never hardcode cache key strings inside business modules.
 */
export { buildQueryCacheHash, normalizeCacheFilterValue } from './cache-query-hash.util';

export const CacheKeys = {
  attributes: {
    list: (queryHash: string) => `attributes:list:${queryHash}`,
    listPattern: () => 'attributes:list:*',
  },
  brands: {
    list: (queryHash: string) => `brands:list:${queryHash}`,
    listPattern: () => 'brands:list:*',
  },
  importers: {
    list: (queryHash: string) => `importers:list:${queryHash}`,
    listPattern: () => 'importers:list:*',
  },
  packers: {
    list: (queryHash: string) => `packers:list:${queryHash}`,
    listPattern: () => 'packers:list:*',
  },
  subscriptionFrequencies: {
    list: (queryHash: string) => `subscription-frequencies:list:${queryHash}`,
    listPattern: () => 'subscription-frequencies:list:*',
  },
  categories: {
    tree: () => 'categories:tree',
    treePattern: () => 'categories:tree*',
    list: (queryHash: string) => `categories:list:${queryHash}`,
    listPattern: () => 'categories:list:*',
  },
  products: {
    list: (page: number, limit: number, filters = 'all') =>
      `products:list:${page}:${limit}:${filters}`,
    listPattern: () => 'products:list:*',
    detail: (refId: string) => `products:detail:${refId}`,
    detailPattern: (refId?: string) =>
      refId ? `products:detail:${refId}` : 'products:detail:*',
    featured: () => 'products:featured',
    featuredPattern: () => 'products:featured*',
  },
  homepage: {
    banners: () => 'homepage:banners',
    bannersPattern: () => 'homepage:banners*',
    config: () => 'homepage:config',
    configPattern: () => 'homepage:config*',
    categoryHeader: () => 'homepage:category:header',
    categoryHeaderPattern: () => 'homepage:category:header*',
    shopByCategory: () => 'homepage:section:shopByCategory',
    shopByCategoryPattern: () => 'homepage:section:shopByCategory*',
    homeSections: () => 'homepage:home-sections',
    homeSectionsPattern: () => 'homepage:home-sections*',
  },
  publicProducts: {
    list: (queryHash: string) => `public:products:list:${queryHash}`,
    listPattern: () => 'public:products:list:*',
    detail: (slug: string) => `public:products:detail:${slug}`,
    detailPattern: (slug?: string) =>
      slug ? `public:products:detail:${slug}` : 'public:products:detail:*',
  },
  tags: {
    listPattern: () => 'tags:list:*',
  },
  otp: {
    sendCooldown: (purpose: string, mobileNumber: string) =>
      `otp:send:cooldown:${purpose}:${mobileNumber}`,
  },
  session: {
    byToken: (tokenHash: string) => `session:context:token:${tokenHash}`,
    bySessionId: (sessionId: string) => `session:context:id:${sessionId}`,
    tokenPattern: () => 'session:context:token:*',
    idPattern: () => 'session:context:id:*',
  },
} as const;
