const PREDEFINED_CMS_STOREFRONT_PATHS: Record<string, string> = {
  'about-cureka': '/about',
  'privacy-policy': '/policies/privacy',
  'terms-and-conditions': '/policies/terms',
  'returns-refunds': '/policies/returns',
  'shipping-policy': '/policies/shipping',
};

export const cmsSlugToStorefrontPath = (slug: string): string | null => {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  return PREDEFINED_CMS_STOREFRONT_PATHS[normalized] ?? `/policies/${normalized}`;
};
