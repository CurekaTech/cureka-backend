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
    pdpBanners: () => 'homepage:pdp-banners:v2',
    pdpBannersPattern: () => 'homepage:pdp-banners*',
    config: () => 'homepage:config',
    configPattern: () => 'homepage:config*',
    categoryHeader: () => 'homepage:category:header:v2',
    categoryHeaderPattern: () => 'homepage:category:header*',
    shopByCategory: () => 'homepage:section:shopByCategory',
    shopByCategoryPattern: () => 'homepage:section:shopByCategory*',
    bestSellers: () => 'homepage:section:bestSellers:v3',
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
    healthConcerns: () => 'homepage:section:healthConcerns:v2',
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
    popular: (perPage: number) => `public:search:popular:${perPage}`,
    popularPattern: () => 'public:search:popular:*',
  },
  publicProducts: {
    // v6: list Pack of 1 deep-links + slug token variant resolution (500ml ≠ 50ml).
    list: (queryHash: string) => `public:products:v6:list:${queryHash}`,
    listPattern: () => 'public:products:v6:list:*',
    variantSearch: (queryHash: string) => `public:products:v6:variant-search:${queryHash}`,
    variantSearchPattern: () => 'public:products:v6:variant-search:*',
    detail: (slug: string) => `public:products:v6:detail:${slug}`,
    detailPattern: (slug?: string) =>
      slug ? `public:products:v6:detail:${slug}` : 'public:products:v6:detail:*',
    filters: (queryHash: string) => `public:products:v1:filters:${queryHash}`,
    filtersPattern: () => 'public:products:v1:filters:*',
    filterBrands: (queryHash: string) => `public:products:v1:filter-brands:${queryHash}`,
    filterBrandsPattern: () => 'public:products:v1:filter-brands:*',
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
