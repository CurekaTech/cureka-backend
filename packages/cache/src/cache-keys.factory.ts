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
    bestSellers: () => 'homepage:section:bestSellers',
    bestSellersPattern: () => 'homepage:section:bestSellers*',
    shopByWellnessGoals: () => 'homepage:section:shopByWellnessGoals',
    shopByWellnessGoalsPattern: () => 'homepage:section:shopByWellnessGoals*',
    brandsWeTrust: () => 'homepage:section:brandsWeTrust',
    brandsWeTrustPattern: () => 'homepage:section:brandsWeTrust*',
    homeSections: () => 'homepage:home-sections',
    homeSectionsPattern: () => 'homepage:home-sections*',
    sections: (variant = 'all') => `homepage:sections:${variant}`,
    sectionsPattern: () => 'homepage:sections*',
  },
  publicProducts: {
    list: (queryHash: string) => `public:products:v2:list:${queryHash}`,
    listPattern: () => 'public:products:v2:list:*',
    variantSearch: (queryHash: string) => `public:products:v2:variant-search:${queryHash}`,
    variantSearchPattern: () => 'public:products:v2:variant-search:*',
    detail: (slug: string) => `public:products:v2:detail:${slug}`,
    detailPattern: (slug?: string) =>
      slug ? `public:products:v2:detail:${slug}` : 'public:products:v2:detail:*',
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
