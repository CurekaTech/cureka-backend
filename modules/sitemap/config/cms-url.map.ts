/**
 * Must match the storefront's CMS_PAGE_ROUTES (cureka-frontend
 * src/modules/cms/constants/cmsRoutes.ts). The storefront only serves these
 * pages, so unmapped CMS slugs are left out of the sitemap instead of guessing
 * a URL that would 404.
 */
const PREDEFINED_CMS_STOREFRONT_PATHS: Record<string, string> = {
  'about-us': '/about-us',
  'about-cureka': '/about-us',
  'privacy-policy': '/policies/privacy',
  'terms-and-conditions': '/policies/terms',
  'returns-refunds': '/policies/returns',
  'shipping-policy': '/policies/shipping',
};

export const cmsSlugToStorefrontPath = (slug: string): string | null => {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  return PREDEFINED_CMS_STOREFRONT_PATHS[normalized] ?? null;
};
