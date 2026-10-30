import { PermissionAction } from '../enums/permission-action.enum';

const ALL_ACTIONS = [
  PermissionAction.CREATE,
  PermissionAction.READ,
  PermissionAction.UPDATE,
  PermissionAction.DELETE,
  PermissionAction.STATUS,
  PermissionAction.APPROVE,
  PermissionAction.REJECT,
] as const;
const CRUD_ACTIONS = [
  PermissionAction.CREATE,
  PermissionAction.READ,
  PermissionAction.UPDATE,
  PermissionAction.DELETE,
  PermissionAction.STATUS,
] as const;
const READ = [PermissionAction.READ] as const;
const ORDER_ROW = [PermissionAction.READ, PermissionAction.UPDATE, PermissionAction.STATUS] as const;
const SETTINGS_ROW = ORDER_ROW;

/**
 * Sidebar rows that used to share one permission module with other rows.
 * Each row owns `<module>.<action>` codes, so a role can allow one tab and not another.
 * `base` is the module the API endpoints check; owning a row code satisfies
 * `<base>.<action>` (see `expandScopedPermissionCodes`).
 *
 * Rows must exist in `MENU_HIERARCHY`, and the codes are inserted by migration
 * 1786016000000-add-menu-scoped-permissions.
 */
export interface MenuPermissionScope {
  menuKey: string;
  module: string;
  base: string;
  label: string;
  actions: readonly PermissionAction[];
}

const scope = (
  menuKey: string,
  base: string,
  label: string,
  actions: readonly PermissionAction[],
): MenuPermissionScope => ({
  menuKey,
  module: menuKey.replace(/-/g, '_'),
  base,
  label,
  actions,
});

export const MENU_PERMISSION_SCOPES: readonly MenuPermissionScope[] = [
  scope('active-users', 'users', 'Active Users', [
    PermissionAction.READ,
    PermissionAction.STATUS,
  ]),
  scope('inactive-users', 'users', 'Inactive Users', [
    PermissionAction.READ,
    PermissionAction.STATUS,
  ]),

  scope('add-vendor', 'vendors', 'Add Vendor', [PermissionAction.CREATE]),
  scope('vendor-list', 'vendors', 'Vendor List', [
    PermissionAction.READ,
    PermissionAction.UPDATE,
    PermissionAction.DELETE,
    PermissionAction.STATUS,
  ]),

  scope('products-list-all', 'products', 'All Products', ALL_ACTIONS),
  scope('products-list-approved', 'products', 'Active Products', [
    PermissionAction.READ,
    PermissionAction.UPDATE,
    PermissionAction.STATUS,
    PermissionAction.APPROVE,
  ]),
  scope('products-list-pending', 'products', 'Pending Review Products', [
    PermissionAction.READ,
    PermissionAction.UPDATE,
    PermissionAction.APPROVE,
    PermissionAction.REJECT,
  ]),
  scope('products-list-rejected', 'products', 'Rejected Products', [
    PermissionAction.READ,
    PermissionAction.UPDATE,
    PermissionAction.DELETE,
    PermissionAction.REJECT,
  ]),
  scope('products-bulk-upload-products', 'products', 'Product Bulk Upload', [
    PermissionAction.CREATE,
  ]),
  scope('products-bulk-price-update', 'products', 'Bulk Price Update', [PermissionAction.UPDATE]),
  scope('products-bulk-cod-update', 'products', 'Bulk COD Update', [PermissionAction.UPDATE]),
  scope('products-bulk-return-update', 'products', 'Bulk Return & Replacement Update', [
    PermissionAction.UPDATE,
  ]),

  scope('bundle-products-list-all', 'bundle_products', 'All Bundle Products', ALL_ACTIONS),
  scope('bundle-products-list-approved', 'bundle_products', 'Active Bundle Products', [
    PermissionAction.READ,
    PermissionAction.APPROVE,
  ]),
  scope('bundle-products-list-pending', 'bundle_products', 'Pending Review Bundle Products', READ),
  scope('bundle-products-list-rejected', 'bundle_products', 'Rejected Bundle Products', [
    PermissionAction.READ,
    PermissionAction.REJECT,
  ]),

  scope('orders-add', 'orders', 'Add Orders', [PermissionAction.CREATE]),
  scope('orders-list-all', 'orders', 'All Orders', ORDER_ROW),
  scope('active-orders', 'orders', 'Active Orders', ORDER_ROW),
  scope('in-transit-orders', 'orders', 'In Transit Orders', ORDER_ROW),
  scope('delivered-orders', 'orders', 'Completed Orders', ORDER_ROW),
  scope('cancelled-orders', 'orders', 'Cancelled Orders', ORDER_ROW),

  scope('returns-create', 'returns', 'Create Return', [PermissionAction.CREATE]),
  scope('returns-all', 'returns', 'All Returns', [
    PermissionAction.READ,
    PermissionAction.UPDATE,
    PermissionAction.STATUS,
    PermissionAction.APPROVE,
    PermissionAction.REJECT,
  ]),
  scope('returns-pending-review', 'returns', 'Pending Review Returns', READ),
  scope('returns-pickup', 'returns', 'Pickup & Transit Returns', READ),
  scope('returns-qc', 'returns', 'Quality Check Returns', [PermissionAction.STATUS]),
  scope('returns-refund-pending', 'returns', 'Refund Pending Returns', READ),

  scope('refunds-all', 'refund_requests', 'All Refunds', [
    PermissionAction.CREATE,
    PermissionAction.READ,
    PermissionAction.UPDATE,
    PermissionAction.STATUS,
    PermissionAction.APPROVE,
    PermissionAction.REJECT,
  ]),
  scope('refunds-wallets', 'refund_requests', 'Refund Wallets', READ),

  scope('orders-cod-blocklist-all', 'cod_blocklist', 'COD Blocklist', CRUD_ACTIONS),
  scope('orders-cod-blocklist-bulk-upload', 'cod_blocklist', 'COD Blocklist Bulk Upload', [
    PermissionAction.CREATE,
    PermissionAction.READ,
  ]),

  scope('subscriptions-product-payments', 'subscription_payments', 'Subscription Payments', READ),
  scope('subscriptions-failed-renewals', 'subscription_payments', 'Failed Renewals', READ),

  scope('masters-health-concern', 'health_concerns', 'Health Concern', CRUD_ACTIONS),
  scope('health-concern-indexing', 'health_concerns', 'Health Concern Indexing', [
    PermissionAction.READ,
    PermissionAction.UPDATE,
  ]),

  scope('cms-pages-about-us', 'cms_pages', 'About Cureka Page', CRUD_ACTIONS),
  scope('cms-pages-privacy-policy', 'cms_pages', 'Privacy Policy Page', CRUD_ACTIONS),
  scope('cms-pages-terms-and-conditions', 'cms_pages', 'Terms & Conditions Page', CRUD_ACTIONS),
  scope('cms-pages-returns-refunds', 'cms_pages', 'Returns & Refunds Page', CRUD_ACTIONS),
  scope('cms-pages-shipping-policy', 'cms_pages', 'Shipping Policy Page', CRUD_ACTIONS),

  scope('cart-charges-view', 'settings', 'Cart Charges', SETTINGS_ROW),
  scope('payment-methods-view', 'settings', 'Payment Methods', SETTINGS_ROW),
  scope('store-configuration-view', 'settings', 'Store Configuration', SETTINGS_ROW),
  scope('logistic-partners-view', 'settings', 'Logistic Partners', SETTINGS_ROW),
  scope('email-recipient-view', 'settings', 'Email Recipient', SETTINGS_ROW),
];

export const MENU_PERMISSION_SCOPE_BY_KEY: ReadonlyMap<string, MenuPermissionScope> = new Map(
  MENU_PERMISSION_SCOPES.map((item) => [item.menuKey, item]),
);

const BASE_BY_SCOPED_MODULE: ReadonlyMap<string, string> = new Map(
  MENU_PERMISSION_SCOPES.map((item) => [item.module, item.base]),
);

const ACTION_VERBS: Record<PermissionAction, string> = {
  [PermissionAction.READ]: 'View',
  [PermissionAction.CREATE]: 'Create',
  [PermissionAction.UPDATE]: 'Update',
  [PermissionAction.DELETE]: 'Delete',
  [PermissionAction.STATUS]: 'Change Status',
  [PermissionAction.APPROVE]: 'Approve',
  [PermissionAction.REJECT]: 'Reject',
};

export interface ScopedPermissionDefinition {
  code: string;
  name: string;
  module: string;
  action: PermissionAction;
  baseCode: string;
}

export const SCOPED_PERMISSION_DEFINITIONS: readonly ScopedPermissionDefinition[] =
  MENU_PERMISSION_SCOPES.flatMap((item) =>
    item.actions.map((action) => ({
      code: `${item.module}.${action}`,
      name: `${ACTION_VERBS[action]} ${item.label}`,
      module: item.module,
      action,
      baseCode: `${item.base}.${action}`,
    })),
  );

/** Codes that decide whether a scoped sidebar row is visible. */
export const scopedMenuRequiredPermissions = (menuKey: string): string[] | undefined => {
  const item = MENU_PERMISSION_SCOPE_BY_KEY.get(menuKey);
  if (!item) return undefined;
  if (item.actions.includes(PermissionAction.READ)) {
    return [`${item.module}.${PermissionAction.READ}`];
  }
  return item.actions.map((action) => `${item.module}.${action}`);
};

/**
 * Adds `<base>.<action>` for every owned row code, so endpoints that check
 * `products.read` accept `products_list_approved.read`.
 */
export const expandScopedPermissionCodes = (codes: Iterable<string>): Set<string> => {
  const expanded = new Set<string>();
  for (const code of codes) {
    expanded.add(code);
    const separator = code.lastIndexOf('.');
    if (separator <= 0) continue;
    const base = BASE_BY_SCOPED_MODULE.get(code.slice(0, separator));
    if (base) expanded.add(`${base}${code.slice(separator)}`);
  }
  return expanded;
};
