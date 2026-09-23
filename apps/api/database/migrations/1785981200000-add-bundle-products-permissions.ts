import { MigrationInterface, QueryRunner } from 'typeorm';

interface PermissionSeed {
  refId: string;
  name: string;
  code: string;
  module: string;
  action: string;
}

const permissions: PermissionSeed[] = [
  {
    refId: 'PER00000357',
    name: 'View Bundle Products',
    code: 'bundle_products.read',
    module: 'bundle_products',
    action: 'read',
  },
  {
    refId: 'PER00000358',
    name: 'Create Bundle Products',
    code: 'bundle_products.create',
    module: 'bundle_products',
    action: 'create',
  },
  {
    refId: 'PER00000359',
    name: 'Update Bundle Products',
    code: 'bundle_products.update',
    module: 'bundle_products',
    action: 'update',
  },
  {
    refId: 'PER00000360',
    name: 'Change Bundle Products Status',
    code: 'bundle_products.status',
    module: 'bundle_products',
    action: 'status',
  },
  {
    refId: 'PER00000361',
    name: 'Delete Bundle Products',
    code: 'bundle_products.delete',
    module: 'bundle_products',
    action: 'delete',
  },
  {
    refId: 'PER00000362',
    name: 'Approve Bundle Products',
    code: 'bundle_products.approve',
    module: 'bundle_products',
    action: 'approve',
  },
  {
    refId: 'PER00000363',
    name: 'Reject Bundle Products',
    code: 'bundle_products.reject',
    module: 'bundle_products',
    action: 'reject',
  },
];

export class AddBundleProductsPermissions1785981200000 implements MigrationInterface {
  name = 'AddBundleProductsPermissions1785981200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const permission of permissions) {
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
