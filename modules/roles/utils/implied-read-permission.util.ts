const WRITE_ACTIONS = new Set(['create', 'update']);

/**
 * Dropdown, picker, and lookup modules used while creating or editing another record.
 * A role with any create/update permission can read these without a separate read grant.
 * Products and bundles are here because blog posts, CMS sections, coupons, offers,
 * vendors, and category parents all load the product picker or product-wizard dropdowns.
 * Customer, order, admin-user, and audit lists are not in this set.
 */
const MASTER_DATA_MODULES = new Set([
  'age_groups',
  'attributes',
  'blog_categories',
  'brands',
  'bundle_products',
  'categories',
  'category_filters',
  'cities',
  'countries',
  'coupon_codes',
  'gallery',
  'health_concerns',
  'importers',
  'manufacturers',
  'membership_benefits',
  'packers',
  'product_informations',
  'product_natures',
  'product_tags',
  'products',
  'reason_masters',
  'states',
  'subcategories',
  'subsubcategories',
  'subsubsubcategories',
  'subscription_frequencies',
  'support_categories',
  'units',
  'wellness_goals',
]);

/**
 * Reference reads a create/update screen needs from another module.
 * Customer search on Add Orders is `users.read`; the role often only has `orders.create`.
 */
const EXTRA_READS_FOR_WRITE: Record<string, readonly string[]> = {
  'orders.create': ['users.read', 'products.read', 'payment-request.read'],
  'orders.update': ['users.read', 'products.read', 'payment-request.read'],
  'payment-request.create': ['users.read', 'products.read', 'payment-request.read'],
  'payment-request.update': ['users.read', 'products.read', 'payment-request.read'],
};

const splitPermission = (
  permission: string,
): { moduleName: string; action: string } | null => {
  const separator = Math.max(permission.lastIndexOf('.'), permission.lastIndexOf(':'));
  if (separator <= 0) return null;
  const moduleName = permission.slice(0, separator).trim();
  const action = permission.slice(separator + 1).trim().toLowerCase();
  if (!moduleName || !action) return null;
  return { moduleName, action };
};

const hasWriteAccess = (owned: Set<string>): boolean => {
  for (const code of owned) {
    const parsed = splitPermission(code);
    if (parsed && WRITE_ACTIONS.has(parsed.action)) return true;
  }
  return false;
};

/**
 * A required permission is granted when the role has that code, or when a read
 * is needed to use a create/update screen the role already has.
 * Create and update never imply each other, and they never imply status or delete.
 */
export const isRequiredPermissionSatisfied = (
  required: string,
  owned: Set<string>,
): boolean => {
  if (owned.has(required) || owned.has('*')) return true;

  const parsed = splitPermission(required);
  if (!parsed || parsed.action !== 'read') return false;

  if (
    owned.has(`${parsed.moduleName}.create`) ||
    owned.has(`${parsed.moduleName}.update`)
  ) {
    return true;
  }

  if (MASTER_DATA_MODULES.has(parsed.moduleName) && hasWriteAccess(owned)) {
    return true;
  }

  for (const code of owned) {
    const reads = EXTRA_READS_FOR_WRITE[code];
    if (reads?.includes(required)) return true;
  }

  return false;
};

export const hasRequiredPermissions = (
  required: string[],
  owned: Set<string>,
  mode: 'all' | 'any',
): boolean => {
  if (mode === 'any') {
    return required.some((permission) => isRequiredPermissionSatisfied(permission, owned));
  }
  return required.every((permission) => isRequiredPermissionSatisfied(permission, owned));
};
