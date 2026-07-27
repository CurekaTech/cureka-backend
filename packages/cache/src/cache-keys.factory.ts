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
      `products:list:v2:${page}:${limit}:${filters}`,
    listPattern: () => 'products:list:*',
    detail: (refId: string) => `products:detail:${refId}`,
    detailPattern: (refId?: string) =>
      refId ? `products:detail:${refId}` : 'products:detail:*',
    featured: () => 'products:featured',
    featuredPattern: () => 'products:featured*',
  },
  watchAndShop: {
    list: (queryHash: string) => `watch-and-shop:list:${queryHash}`,
    listPattern: () => 'watch-and-shop:list:*',
  },
  expertTalks: {
    list: (queryHash: string) => `expert-talks:list:${queryHash}`,
    listPattern: () => 'expert-talks:list:*',
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
    watchAndShop: () => 'homepage:section:watchAndShop',
    watchAndShopPattern: () => 'homepage:section:watchAndShop*',
    healthReads: () => 'homepage:section:healthReads',
    healthReadsPattern: () => 'homepage:section:healthReads*',
    shopByWellnessGoals: () => 'homepage:section:shopByWellnessGoals',
    shopByWellnessGoalsPattern: () => 'homepage:section:shopByWellnessGoals*',
    brandsWeTrust: () => 'homepage:section:brandsWeTrust',
    brandsWeTrustPattern: () => 'homepage:section:brandsWeTrust*',
    expertCuratedBundles: () => 'homepage:section:expertCuratedBundles',
    expertCuratedBundlesPattern: () => 'homepage:section:expertCuratedBundles*',
    curatedWellnessEssentials: () => 'homepage:section:curatedWellnessEssentials:v2',
    curatedWellnessEssentialsPattern: () => 'homepage:section:curatedWellnessEssentials*',
    homeSections: () => 'homepage:home-sections',
    homeSectionsPattern: () => 'homepage:home-sections*',
    sections: (variant = 'all') => `homepage:sections:${variant}`,
    sectionsPattern: () => 'homepage:sections*',
  },
  publicProducts: {
    list: (queryHash: string) => `public:products:v3:list:${queryHash}`,
    listPattern: () => 'public:products:v3:list:*',
    variantSearch: (queryHash: string) => `public:products:v3:variant-search:${queryHash}`,
    variantSearchPattern: () => 'public:products:v3:variant-search:*',
    detail: (slug: string) => `public:products:v3:detail:${slug}`,
    detailPattern: (slug?: string) =>
      slug ? `public:products:v3:detail:${slug}` : 'public:products:v3:detail:*',
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
  wishlist: {
    ids: (userId: string) => `wishlist:ids:${userId}`,
    page: (userId: string, page: number, limit: number) =>
      `wishlist:page:${userId}:${page}:${limit}`,
    pagePattern: (userId: string) => `wishlist:page:${userId}:*`,
  },
} as const;
