import { MigrationInterface, QueryRunner } from 'typeorm';

interface PermissionSeed {
  refId: string;
  name: string;
  code: string;
  module: string;
  action: string;
}

/** One read + one export per report screen (export stored as action `read`). */
const reportPermissions: PermissionSeed[] = [
  {
    refId: 'PER00000367',
    name: 'View Sales & Revenue Report',
    code: 'reports_sales_revenue.read',
    module: 'reports_sales_revenue',
    action: 'read',
  },
  {
    refId: 'PER00000368',
    name: 'Download Sales & Revenue Report',
    code: 'reports_sales_revenue.export',
    module: 'reports_sales_revenue',
    action: 'read',
  },
  {
    refId: 'PER00000369',
    name: 'View Orders Report',
    code: 'reports_orders.read',
    module: 'reports_orders',
    action: 'read',
  },
  {
    refId: 'PER00000370',
    name: 'Download Orders Report',
    code: 'reports_orders.export',
    module: 'reports_orders',
    action: 'read',
  },
  {
    refId: 'PER00000371',
    name: 'View Product Performance Report',
    code: 'reports_product_performance.read',
    module: 'reports_product_performance',
    action: 'read',
  },
  {
    refId: 'PER00000372',
    name: 'Download Product Performance Report',
    code: 'reports_product_performance.export',
    module: 'reports_product_performance',
    action: 'read',
  },
  {
    refId: 'PER00000373',
    name: 'View Inventory & Stock Report',
    code: 'reports_inventory_stock.read',
    module: 'reports_inventory_stock',
    action: 'read',
  },
  {
    refId: 'PER00000374',
    name: 'Download Inventory & Stock Report',
    code: 'reports_inventory_stock.export',
    module: 'reports_inventory_stock',
    action: 'read',
  },
  {
    refId: 'PER00000375',
    name: 'View Customers Report',
    code: 'reports_customers.read',
    module: 'reports_customers',
    action: 'read',
  },
  {
    refId: 'PER00000376',
    name: 'Download Customers Report',
    code: 'reports_customers.export',
    module: 'reports_customers',
    action: 'read',
  },
  {
    refId: 'PER00000377',
    name: 'View Payments Report',
    code: 'reports_payments.read',
    module: 'reports_payments',
    action: 'read',
  },
  {
    refId: 'PER00000378',
    name: 'Download Payments Report',
    code: 'reports_payments.export',
    module: 'reports_payments',
    action: 'read',
  },
  {
    refId: 'PER00000379',
    name: 'View Returns & Refunds Report',
    code: 'reports_returns_refunds.read',
    module: 'reports_returns_refunds',
    action: 'read',
  },
  {
    refId: 'PER00000380',
    name: 'Download Returns & Refunds Report',
    code: 'reports_returns_refunds.export',
    module: 'reports_returns_refunds',
    action: 'read',
  },
  {
    refId: 'PER00000381',
    name: 'View Coupons & Promotions Report',
    code: 'reports_coupons.read',
    module: 'reports_coupons',
    action: 'read',
  },
  {
    refId: 'PER00000382',
    name: 'Download Coupons & Promotions Report',
    code: 'reports_coupons.export',
    module: 'reports_coupons',
    action: 'read',
  },
  {
    refId: 'PER00000383',
    name: 'View Vendor Performance Report',
    code: 'reports_vendor_performance.read',
    module: 'reports_vendor_performance',
    action: 'read',
  },
  {
    refId: 'PER00000384',
    name: 'Download Vendor Performance Report',
    code: 'reports_vendor_performance.export',
    module: 'reports_vendor_performance',
    action: 'read',
  },
  {
    refId: 'PER00000385',
    name: 'View Consultations Report',
    code: 'reports_consultations.read',
    module: 'reports_consultations',
    action: 'read',
  },
  {
    refId: 'PER00000386',
    name: 'Download Consultations Report',
    code: 'reports_consultations.export',
    module: 'reports_consultations',
    action: 'read',
  },
];

/** Fill gaps so each blog submenu has full CRUD (+ status to match seeds). */
const blogExtraPermissions: PermissionSeed[] = [
  {
    refId: 'PER00000387',
    name: 'Create Blog Comments',
    code: 'blog_comments.create',
    module: 'blog_comments',
    action: 'create',
  },
  {
    refId: 'PER00000388',
    name: 'Change Blog Categories Status',
    code: 'blog_categories.status',
    module: 'blog_categories',
    action: 'status',
  },
  {
    refId: 'PER00000389',
    name: 'Change Blog Posts Status',
    code: 'blog_posts.status',
    module: 'blog_posts',
    action: 'status',
  },
  {
    refId: 'PER00000390',
    name: 'Change Blog Comments Status',
    code: 'blog_comments.status',
    module: 'blog_comments',
    action: 'status',
  },
];

const allNewPermissions = [...reportPermissions, ...blogExtraPermissions];

export class AddPerReportAndFixBlogPermissions1785988000000 implements MigrationInterface {
  name = 'AddPerReportAndFixBlogPermissions1785988000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Blog permissions were seeded with module='blog'; Roles UI groups by module name
    // matching the code prefix (blog_categories / blog_posts / blog_comments).
    await queryRunner.query(`
      UPDATE "permissions"
      SET "module" = 'blog_categories'
      WHERE "code" LIKE 'blog_categories.%'
        AND "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "permissions"
      SET "module" = 'blog_posts'
      WHERE "code" LIKE 'blog_posts.%'
        AND "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "permissions"
      SET "module" = 'blog_comments'
      WHERE "code" LIKE 'blog_comments.%'
        AND "deleted_at" IS NULL
    `);

    for (const permission of allNewPermissions) {
      await queryRunner.query(
        `
        INSERT INTO "permissions" ("ref_id", "code", "name", "module", "action", "status", "created_by")
        SELECT $1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::permissions_action_enum, 'active', 'system'
        WHERE NOT EXISTS (
          SELECT 1 FROM "permissions"
          WHERE (
            LOWER("code") = LOWER($2::varchar)
            OR "ref_id" = $1::varchar
          )
          AND "deleted_at" IS NULL
        )
      `,
        [permission.refId, permission.code, permission.name, permission.module, permission.action],
      );
    }

    // Grant new permissions to super_admin / admin
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id"
      FROM "roles" r
      JOIN "permissions" p
        ON p."code" IN (${allNewPermissions.map((p) => `'${p.code}'`).join(', ')})
      WHERE r."slug" IN ('super_admin', 'admin')
      ON CONFLICT DO NOTHING
    `);

    // Roles that had legacy reports.read get every per-report .read
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT DISTINCT rp."role_id", p_new."id"
      FROM "role_permissions" rp
      JOIN "permissions" p_old
        ON p_old."id" = rp."permission_id"
       AND p_old."code" = 'reports.read'
       AND p_old."deleted_at" IS NULL
      JOIN "permissions" p_new
        ON p_new."code" IN (
          'reports_sales_revenue.read',
          'reports_orders.read',
          'reports_product_performance.read',
          'reports_inventory_stock.read',
          'reports_customers.read',
          'reports_payments.read',
          'reports_returns_refunds.read',
          'reports_coupons.read',
          'reports_vendor_performance.read',
          'reports_consultations.read'
        )
       AND p_new."deleted_at" IS NULL
      ON CONFLICT DO NOTHING
    `);

    // Roles that had legacy reports.export get every per-report .export
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT DISTINCT rp."role_id", p_new."id"
      FROM "role_permissions" rp
      JOIN "permissions" p_old
        ON p_old."id" = rp."permission_id"
       AND p_old."code" = 'reports.export'
       AND p_old."deleted_at" IS NULL
      JOIN "permissions" p_new
        ON p_new."code" IN (
          'reports_sales_revenue.export',
          'reports_orders.export',
          'reports_product_performance.export',
          'reports_inventory_stock.export',
          'reports_customers.export',
          'reports_payments.export',
          'reports_returns_refunds.export',
          'reports_coupons.export',
          'reports_vendor_performance.export',
          'reports_consultations.export'
        )
       AND p_new."deleted_at" IS NULL
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "permission_id" IN (
        SELECT "id" FROM "permissions"
        WHERE "code" IN (${allNewPermissions.map((p) => `'${p.code}'`).join(', ')})
      )
    `);

    await queryRunner.query(`
      DELETE FROM "permissions"
      WHERE "code" IN (${allNewPermissions.map((p) => `'${p.code}'`).join(', ')})
        AND "created_by" = 'system'
    `);

    // Revert blog module grouping to legacy 'blog'
    await queryRunner.query(`
      UPDATE "permissions"
      SET "module" = 'blog'
      WHERE (
        "code" LIKE 'blog_categories.%'
        OR "code" LIKE 'blog_posts.%'
        OR "code" LIKE 'blog_comments.%'
      )
        AND "deleted_at" IS NULL
    `);
  }
}
