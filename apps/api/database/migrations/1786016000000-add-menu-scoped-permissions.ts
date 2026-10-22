import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One permission set per sidebar row for rows that shared a module
 * (Product List tabs, order status rows, settings pages, and others).
 * Must match MENU_PERMISSION_SCOPES in modules/roles/constants/menu-permission-scopes.constants.ts.
 *
 * Each role keeps the access it had: a role holding `products.read` gets
 * `products_list_all.read`, `products_list_approved.read`, and the other row codes,
 * and the shared code is removed so the role matrix shows exactly what is stored.
 */
type Action = 'create' | 'read' | 'update' | 'delete' | 'status' | 'approve' | 'reject';

interface ScopedRow {
  menuKey: string;
  base: string;
  label: string;
  actions: Action[];
}

const ALL: Action[] = ['create', 'read', 'update', 'delete', 'status', 'approve', 'reject'];
const CRUD: Action[] = ['create', 'read', 'update', 'delete', 'status'];
const ORDER_ROW: Action[] = ['read', 'update', 'status'];

export const MENU_SCOPED_ROWS: ScopedRow[] = [
  { menuKey: 'active-users', base: 'users', label: 'Active Users', actions: ['read'] },
  { menuKey: 'inactive-users', base: 'users', label: 'Inactive Users', actions: ['read'] },
  { menuKey: 'add-vendor', base: 'vendors', label: 'Add Vendor', actions: ['create'] },
  { menuKey: 'vendor-list', base: 'vendors', label: 'Vendor List', actions: ['read', 'update', 'delete', 'status'] },
  { menuKey: 'products-list-all', base: 'products', label: 'All Products', actions: ALL },
  { menuKey: 'products-list-approved', base: 'products', label: 'Active Products', actions: ['read', 'update', 'status', 'approve'] },
  { menuKey: 'products-list-pending', base: 'products', label: 'Pending Review Products', actions: ['read', 'update', 'approve', 'reject'] },
  { menuKey: 'products-list-rejected', base: 'products', label: 'Rejected Products', actions: ['read', 'update', 'delete', 'reject'] },
  { menuKey: 'products-bulk-upload-products', base: 'products', label: 'Product Bulk Upload', actions: ['create'] },
  { menuKey: 'products-bulk-price-update', base: 'products', label: 'Bulk Price Update', actions: ['update'] },
  { menuKey: 'products-bulk-cod-update', base: 'products', label: 'Bulk COD Update', actions: ['update'] },
  { menuKey: 'products-bulk-return-update', base: 'products', label: 'Bulk Return & Replacement Update', actions: ['update'] },
  { menuKey: 'bundle-products-list-all', base: 'bundle_products', label: 'All Bundle Products', actions: ALL },
  { menuKey: 'bundle-products-list-approved', base: 'bundle_products', label: 'Active Bundle Products', actions: ['read', 'approve'] },
  { menuKey: 'bundle-products-list-pending', base: 'bundle_products', label: 'Pending Review Bundle Products', actions: ['read'] },
  { menuKey: 'bundle-products-list-rejected', base: 'bundle_products', label: 'Rejected Bundle Products', actions: ['read', 'reject'] },
  { menuKey: 'orders-add', base: 'orders', label: 'Add Orders', actions: ['create'] },
  { menuKey: 'orders-list-all', base: 'orders', label: 'All Orders', actions: ORDER_ROW },
  { menuKey: 'active-orders', base: 'orders', label: 'Active Orders', actions: ORDER_ROW },
  { menuKey: 'in-transit-orders', base: 'orders', label: 'In Transit Orders', actions: ORDER_ROW },
  { menuKey: 'delivered-orders', base: 'orders', label: 'Completed Orders', actions: ORDER_ROW },
  { menuKey: 'cancelled-orders', base: 'orders', label: 'Cancelled Orders', actions: ORDER_ROW },
  { menuKey: 'returns-create', base: 'returns', label: 'Create Return', actions: ['create'] },
  { menuKey: 'returns-all', base: 'returns', label: 'All Returns', actions: ['read', 'update', 'status', 'approve', 'reject'] },
  { menuKey: 'returns-pending-review', base: 'returns', label: 'Pending Review Returns', actions: ['read'] },
  { menuKey: 'returns-pickup', base: 'returns', label: 'Pickup & Transit Returns', actions: ['read'] },
  { menuKey: 'returns-qc', base: 'returns', label: 'Quality Check Returns', actions: ['status'] },
  { menuKey: 'returns-refund-pending', base: 'returns', label: 'Refund Pending Returns', actions: ['read'] },
  { menuKey: 'refunds-all', base: 'refund_requests', label: 'All Refunds', actions: ['create', 'read', 'update', 'status', 'approve', 'reject'] },
  { menuKey: 'refunds-wallets', base: 'refund_requests', label: 'Refund Wallets', actions: ['read'] },
  { menuKey: 'orders-cod-blocklist-all', base: 'cod_blocklist', label: 'COD Blocklist', actions: CRUD },
  { menuKey: 'orders-cod-blocklist-bulk-upload', base: 'cod_blocklist', label: 'COD Blocklist Bulk Upload', actions: ['create', 'read'] },
  { menuKey: 'subscriptions-product-payments', base: 'subscription_payments', label: 'Subscription Payments', actions: ['read'] },
  { menuKey: 'subscriptions-failed-renewals', base: 'subscription_payments', label: 'Failed Renewals', actions: ['read'] },
  { menuKey: 'masters-health-concern', base: 'health_concerns', label: 'Health Concern', actions: CRUD },
  { menuKey: 'health-concern-indexing', base: 'health_concerns', label: 'Health Concern Indexing', actions: ['read', 'update'] },
  { menuKey: 'cms-pages-about-us', base: 'cms_pages', label: 'About Cureka Page', actions: CRUD },
  { menuKey: 'cms-pages-privacy-policy', base: 'cms_pages', label: 'Privacy Policy Page', actions: CRUD },
  { menuKey: 'cms-pages-terms-and-conditions', base: 'cms_pages', label: 'Terms & Conditions Page', actions: CRUD },
  { menuKey: 'cms-pages-returns-refunds', base: 'cms_pages', label: 'Returns & Refunds Page', actions: CRUD },
  { menuKey: 'cms-pages-shipping-policy', base: 'cms_pages', label: 'Shipping Policy Page', actions: CRUD },
  { menuKey: 'cart-charges-view', base: 'settings', label: 'Cart Charges', actions: ORDER_ROW },
  { menuKey: 'payment-methods-view', base: 'settings', label: 'Payment Methods', actions: ORDER_ROW },
  { menuKey: 'store-configuration-view', base: 'settings', label: 'Store Configuration', actions: ORDER_ROW },
  { menuKey: 'logistic-partners-view', base: 'settings', label: 'Logistic Partners', actions: ORDER_ROW },
  { menuKey: 'email-recipient-view', base: 'settings', label: 'Email Recipient', actions: ORDER_ROW },
];

const VERBS: Record<Action, string> = {
  read: 'View',
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  status: 'Change Status',
  approve: 'Approve',
  reject: 'Reject',
};

const scopedPermissions = MENU_SCOPED_ROWS.flatMap((row) => {
  const module = row.menuKey.replace(/-/g, '_');
  return row.actions.map((action) => ({
    code: `${module}.${action}`,
    name: `${VERBS[action]} ${row.label}`,
    module,
    action,
    baseCode: `${row.base}.${action}`,
  }));
});

const replacedBaseCodes = [...new Set(scopedPermissions.map((permission) => permission.baseCode))];

export class AddMenuScopedPermissions1786016000000 implements MigrationInterface {
  name = 'AddMenuScopedPermissions1786016000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [{ max_ref }] = await queryRunner.query(`
      SELECT COALESCE(MAX(SUBSTRING("ref_id" FROM 4)::bigint), 0) AS max_ref
      FROM "permissions"
      WHERE "ref_id" ~ '^PER[0-9]{8}$'
    `);
    let nextRef = Number(max_ref);

    for (const permission of scopedPermissions) {
      const existing = await queryRunner.query(
        `SELECT 1 FROM "permissions" WHERE LOWER("code") = LOWER($1) AND "deleted_at" IS NULL`,
        [permission.code],
      );
      if (existing.length > 0) continue;

      nextRef += 1;
      await queryRunner.query(
        `
        INSERT INTO "permissions" ("ref_id", "code", "name", "module", "action", "status", "created_by")
        VALUES ($1, $2, $3, $4, $5::permissions_action_enum, 'active', 'system')
      `,
        [
          `PER${String(nextRef).padStart(8, '0')}`,
          permission.code,
          permission.name,
          permission.module,
          permission.action,
        ],
      );
    }

    for (const permission of scopedPermissions) {
      await queryRunner.query(
        `
        INSERT INTO "role_permissions" ("role_id", "permission_id")
        SELECT rp."role_id", scoped."id"
        FROM "role_permissions" rp
        JOIN "permissions" base ON base."id" = rp."permission_id" AND base."code" = $1
        JOIN "permissions" scoped ON scoped."code" = $2 AND scoped."deleted_at" IS NULL
        ON CONFLICT DO NOTHING
      `,
        [permission.baseCode, permission.code],
      );
    }

    await queryRunner.query(
      `
      DELETE FROM "role_permissions"
      WHERE "permission_id" IN (SELECT "id" FROM "permissions" WHERE "code" = ANY($1))
    `,
      [replacedBaseCodes],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const permission of scopedPermissions) {
      await queryRunner.query(
        `
        INSERT INTO "role_permissions" ("role_id", "permission_id")
        SELECT rp."role_id", base."id"
        FROM "role_permissions" rp
        JOIN "permissions" scoped ON scoped."id" = rp."permission_id" AND scoped."code" = $2
        JOIN "permissions" base ON base."code" = $1 AND base."deleted_at" IS NULL
        ON CONFLICT DO NOTHING
      `,
        [permission.baseCode, permission.code],
      );
    }

    const codes = scopedPermissions.map((permission) => permission.code);
    await queryRunner.query(
      `
      DELETE FROM "role_permissions"
      WHERE "permission_id" IN (SELECT "id" FROM "permissions" WHERE "code" = ANY($1))
    `,
      [codes],
    );
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "code" = ANY($1) AND "created_by" = 'system'`,
      [codes],
    );
  }
}
