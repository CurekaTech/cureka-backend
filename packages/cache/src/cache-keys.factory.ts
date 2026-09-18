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
    list: (queryHash: string) => `watch-and-shop:v2:list:${queryHash}`,
    listPattern: () => 'watch-and-shop:*',
  },
  expertTalks: {
    list: (queryHash: string) => `expert-talks:list:${queryHash}`,
    listPattern: () => 'expert-talks:list:*',
  },
  homepage: {
    banners: () => 'homepage:banners',
    bannersPattern: () => 'homepage:banners*',
    pdpBanners: () => 'homepage:pdp-banners:v3',
    pdpBannersPattern: () => 'homepage:pdp-banners*',
    config: () => 'homepage:config',
    configPattern: () => 'homepage:config*',
    categoryHeader: () => 'homepage:category:header:v2',
    categoryHeaderPattern: () => 'homepage:category:header*',
    shopByCategory: () => 'homepage:section:shopByCategory:v2',
    shopByCategoryPattern: () => 'homepage:section:shopByCategory*',
    bestSellers: () => 'homepage:section:bestSellers:v4',
    bestSellersPattern: () => 'homepage:section:bestSellers*',
    watchAndShop: () => 'homepage:section:watchAndShop:v2',
    watchAndShopPattern: () => 'homepage:section:watchAndShop*',
    healthReads: () => 'homepage:section:healthReads',
    healthReadsPattern: () => 'homepage:section:healthReads*',
    shopByWellnessGoals: () => 'homepage:section:shopByWellnessGoals',
    shopByWellnessGoalsPattern: () => 'homepage:section:shopByWellnessGoals*',
    brandsWeTrust: () => 'homepage:section:brandsWeTrust',
    brandsWeTrustPattern: () => 'homepage:section:brandsWeTrust*',
    expertCuratedBundles: () => 'homepage:section:expertCuratedBundles',
    expertCuratedBundlesPattern: () => 'homepage:section:expertCuratedBundles*',
    healthConcerns: () => 'homepage:section:healthConcerns:v3',
    healthConcernsPattern: () => 'homepage:section:healthConcerns*',
    curatedWellnessEssentials: () => 'homepage:section:curatedWellnessEssentials:v2',
    curatedWellnessEssentialsPattern: () => 'homepage:section:curatedWellnessEssentials*',
    homeSections: () => 'homepage:home-sections',
    homeSectionsPattern: () => 'homepage:home-sections*',
    sections: (variant = 'all') => `homepage:sections:${variant}`,
    sectionsPattern: () => 'homepage:sections*',
    cmsPages: () => 'homepage:cms-pages:v1',
    cmsPagesPattern: () => 'homepage:cms-pages*',
  },
  publicSearch: {
    popular: (perPage: number) => `public:search:popular:v2:${perPage}`,
    popularPattern: () => 'public:search:popular:*',
  },
  publicProducts: {
    // v8: slim storefront list cards (drops unused list-card fields).
    list: (queryHash: string) => `public:products:v8:list:${queryHash}`,
    listPattern: () => 'public:products:v8:list:*',
    variantSearch: (queryHash: string) => `public:products:v7:variant-search:${queryHash}`,
    variantSearchPattern: () => 'public:products:v7:variant-search:*',
    detail: (slug: string) => `public:products:v6:detail:${slug}`,
    detailPattern: (slug?: string) =>
      slug ? `public:products:v6:detail:${slug}` : 'public:products:v6:detail:*',
    filters: (queryHash: string) => `public:products:v1:filters:${queryHash}`,
    filtersPattern: () => 'public:products:v1:filters:*',
    filterBrands: (queryHash: string) => `public:products:v1:filter-brands:${queryHash}`,
    filterBrandsPattern: () => 'public:products:v1:filter-brands:*',
    // v2: slim storefront card (drops unused list-card fields). Unsigned; GCS URLs signed after Redis.
    youMayAlsoLike: (queryHash: string) => `public:products:v2:ymal:${queryHash}`,
    youMayAlsoLikePattern: () => 'public:products:v2:ymal:*',
    frequentlyBoughtTogether: (queryHash: string) => `public:products:v2:fbt:${queryHash}`,
    frequentlyBoughtTogetherPattern: () => 'public:products:v2:fbt:*',
    recommendationPatterns: () => [
      'public:products:v1:ymal:*',
      'public:products:v2:ymal:*',
      'public:products:v1:fbt:*',
      'public:products:v2:fbt:*',
    ],
  },
  publicBundles: {
    // v2: list cards include primaryImageUrl fallback when bundleIcon is null.
    list: (queryHash: string) => `public:bundles:v2:list:${queryHash}`,
    listPattern: () => 'public:bundles:v2:list:*',
    detail: (slug: string) => `public:bundles:v2:detail:${slug}`,
    detailPattern: (slug?: string) =>
      slug ? `public:bundles:v2:detail:${slug}` : 'public:bundles:v2:detail:*',
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
