import { MigrationInterface, QueryRunner } from 'typeorm';

interface PermissionSeed {
  refId: string;
  name: string;
  code: string;
  module: string;
  action: string;
}

const permissions: PermissionSeed[] = [
  // Sub Category
  { refId: 'PER00000150', name: 'View Sub Category', code: 'subcategories.read', module: 'subcategories', action: 'read' },
  { refId: 'PER00000151', name: 'Create Sub Category', code: 'subcategories.create', module: 'subcategories', action: 'create' },
  { refId: 'PER00000152', name: 'Update Sub Category', code: 'subcategories.update', module: 'subcategories', action: 'update' },
  { refId: 'PER00000153', name: 'Change Sub Category Status', code: 'subcategories.status', module: 'subcategories', action: 'status' },
  { refId: 'PER00000154', name: 'Delete Sub Category', code: 'subcategories.delete', module: 'subcategories', action: 'delete' },

  // Sub Sub Category
  { refId: 'PER00000155', name: 'View Sub Sub Category', code: 'subsubcategories.read', module: 'subsubcategories', action: 'read' },
  { refId: 'PER00000156', name: 'Create Sub Sub Category', code: 'subsubcategories.create', module: 'subsubcategories', action: 'create' },
  { refId: 'PER00000157', name: 'Update Sub Sub Category', code: 'subsubcategories.update', module: 'subsubcategories', action: 'update' },
  { refId: 'PER00000158', name: 'Change Sub Sub Category Status', code: 'subsubcategories.status', module: 'subsubcategories', action: 'status' },
  { refId: 'PER00000159', name: 'Delete Sub Sub Category', code: 'subsubcategories.delete', module: 'subsubcategories', action: 'delete' },

  // Sub Sub Sub Category
  { refId: 'PER00000160', name: 'View Sub Sub Sub Category', code: 'subsubsubcategories.read', module: 'subsubsubcategories', action: 'read' },
  { refId: 'PER00000161', name: 'Create Sub Sub Sub Category', code: 'subsubsubcategories.create', module: 'subsubsubcategories', action: 'create' },
  { refId: 'PER00000162', name: 'Update Sub Sub Sub Category', code: 'subsubsubcategories.update', module: 'subsubsubcategories', action: 'update' },
  { refId: 'PER00000163', name: 'Change Sub Sub Sub Category Status', code: 'subsubsubcategories.status', module: 'subsubsubcategories', action: 'status' },
  { refId: 'PER00000164', name: 'Delete Sub Sub Sub Category', code: 'subsubsubcategories.delete', module: 'subsubsubcategories', action: 'delete' },

  // Products
  { refId: 'PER00000165', name: 'View Products', code: 'products.read', module: 'products', action: 'read' },
  { refId: 'PER00000166', name: 'Create Products', code: 'products.create', module: 'products', action: 'create' },
  { refId: 'PER00000167', name: 'Update Products', code: 'products.update', module: 'products', action: 'update' },
  { refId: 'PER00000168', name: 'Change Products Status', code: 'products.status', module: 'products', action: 'status' },
  { refId: 'PER00000169', name: 'Delete Products', code: 'products.delete', module: 'products', action: 'delete' },

  // Product Tags
  { refId: 'PER00000170', name: 'View Product Tags', code: 'product_tags.read', module: 'product_tags', action: 'read' },
  { refId: 'PER00000171', name: 'Create Product Tags', code: 'product_tags.create', module: 'product_tags', action: 'create' },
  { refId: 'PER00000172', name: 'Update Product Tags', code: 'product_tags.update', module: 'product_tags', action: 'update' },
  { refId: 'PER00000173', name: 'Change Product Tags Status', code: 'product_tags.status', module: 'product_tags', action: 'status' },
  { refId: 'PER00000174', name: 'Delete Product Tags', code: 'product_tags.delete', module: 'product_tags', action: 'delete' },

  // Product Informations
  { refId: 'PER00000175', name: 'View Product Informations', code: 'product_informations.read', module: 'product_informations', action: 'read' },
  { refId: 'PER00000176', name: 'Create Product Informations', code: 'product_informations.create', module: 'product_informations', action: 'create' },
  { refId: 'PER00000177', name: 'Update Product Informations', code: 'product_informations.update', module: 'product_informations', action: 'update' },
  { refId: 'PER00000178', name: 'Change Product Informations Status', code: 'product_informations.status', module: 'product_informations', action: 'status' },
  { refId: 'PER00000179', name: 'Delete Product Informations', code: 'product_informations.delete', module: 'product_informations', action: 'delete' },

  // Coupon Codes
  { refId: 'PER00000180', name: 'View Coupon Codes', code: 'coupon_codes.read', module: 'coupon_codes', action: 'read' },
  { refId: 'PER00000181', name: 'Create Coupon Codes', code: 'coupon_codes.create', module: 'coupon_codes', action: 'create' },
  { refId: 'PER00000182', name: 'Update Coupon Codes', code: 'coupon_codes.update', module: 'coupon_codes', action: 'update' },
  { refId: 'PER00000183', name: 'Change Coupon Codes Status', code: 'coupon_codes.status', module: 'coupon_codes', action: 'status' },
  { refId: 'PER00000184', name: 'Delete Coupon Codes', code: 'coupon_codes.delete', module: 'coupon_codes', action: 'delete' },

  // Banners
  { refId: 'PER00000185', name: 'View Banners', code: 'banners.read', module: 'banners', action: 'read' },
  { refId: 'PER00000186', name: 'Create Banners', code: 'banners.create', module: 'banners', action: 'create' },
  { refId: 'PER00000187', name: 'Update Banners', code: 'banners.update', module: 'banners', action: 'update' },
  { refId: 'PER00000188', name: 'Change Banners Status', code: 'banners.status', module: 'banners', action: 'status' },
  { refId: 'PER00000189', name: 'Delete Banners', code: 'banners.delete', module: 'banners', action: 'delete' },

  // CMS
  { refId: 'PER00000190', name: 'View CMS', code: 'cms.read', module: 'cms', action: 'read' },
  { refId: 'PER00000191', name: 'Create CMS', code: 'cms.create', module: 'cms', action: 'create' },
  { refId: 'PER00000192', name: 'Update CMS', code: 'cms.update', module: 'cms', action: 'update' },
  { refId: 'PER00000193', name: 'Change CMS Status', code: 'cms.status', module: 'cms', action: 'status' },
  { refId: 'PER00000194', name: 'Delete CMS', code: 'cms.delete', module: 'cms', action: 'delete' },

  // Admin Users
  { refId: 'PER00000195', name: 'View Admin Users', code: 'admin_users.read', module: 'admin_users', action: 'read' },
  { refId: 'PER00000196', name: 'Create Admin Users', code: 'admin_users.create', module: 'admin_users', action: 'create' },
  { refId: 'PER00000197', name: 'Update Admin Users', code: 'admin_users.update', module: 'admin_users', action: 'update' },
  { refId: 'PER00000198', name: 'Change Admin Users Status', code: 'admin_users.status', module: 'admin_users', action: 'status' },
  { refId: 'PER00000199', name: 'Delete Admin Users', code: 'admin_users.delete', module: 'admin_users', action: 'delete' },

  // Audit Logs
  { refId: 'PER00000200', name: 'View Audit Logs', code: 'audit_logs.read', module: 'audit_logs', action: 'read' },
];

export class AddHierarchicalPermissions1780846000000 implements MigrationInterface {
  name = 'AddHierarchicalPermissions1780846000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const permission of permissions) {
      await queryRunner.query(
        `
        INSERT INTO "permissions" ("ref_id", "code", "name", "module", "action", "status", "created_by")
        SELECT $1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::permissions_action_enum, 'active', 'system'
        WHERE NOT EXISTS (
          SELECT 1 FROM "permissions" WHERE LOWER("code") = LOWER($2::varchar) AND "deleted_at" IS NULL
        )
      `,
        [permission.refId, permission.code, permission.name, permission.module, permission.action],
      );
    }

    // Auto assign all to super_admin and admin
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id"
      FROM "roles" r
      JOIN "permissions" p
        ON p."code" IN (${permissions.map((p) => `'${p.code}'`).join(', ')})
      WHERE r."slug" IN ('super_admin', 'admin')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "permission_id" IN (
        SELECT "id" FROM "permissions"
        WHERE "code" IN (${permissions.map((p) => `'${p.code}'`).join(', ')})
      )
    `);

    await queryRunner.query(`
      DELETE FROM "permissions"
      WHERE "code" IN (${permissions.map((p) => `'${p.code}'`).join(', ')})
        AND "created_by" = 'system'
    `);
  }
}
