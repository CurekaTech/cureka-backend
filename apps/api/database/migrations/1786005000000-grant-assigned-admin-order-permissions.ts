import { MigrationInterface, QueryRunner } from 'typeorm';

const ORDER_PERMISSIONS = ['orders.read', 'orders.create', 'orders.update', 'orders.status'];

/**
 * 1786004000000 only updated the role whose slug is `admin`.
 * Staff accounts keep permissions on admin_users.role_id, which may be a different role.
 */
export class GrantAssignedAdminOrderPermissions1786005000000 implements MigrationInterface {
  name = 'GrantAssignedAdminOrderPermissions1786005000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT DISTINCT au."role_id", p."id"
      FROM "admin_users" au
      JOIN "permissions" p
        ON p."code" IN (${ORDER_PERMISSIONS.map((code) => `'${code}'`).join(', ')})
        AND p."deleted_at" IS NULL
      WHERE au."role" = 'admin'
        AND au."deleted_at" IS NULL
        AND au."role_id" IS NOT NULL
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions" rp
      USING "admin_users" au, "permissions" p, "roles" r
      WHERE rp."role_id" = au."role_id"
        AND rp."permission_id" = p."id"
        AND r."id" = au."role_id"
        AND r."slug" <> 'admin'
        AND au."role" = 'admin'
        AND au."deleted_at" IS NULL
        AND p."code" IN (${ORDER_PERMISSIONS.map((code) => `'${code}'`).join(', ')})
    `);
  }
}
