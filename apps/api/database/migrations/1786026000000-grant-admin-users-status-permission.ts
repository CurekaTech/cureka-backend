import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Customer status toggle (PATCH /users/:refId/status) requires users.status.
 * That permission was only granted to super_admin originally; Admin panel users
 * with role slug/admin enum hit 403. Grant the customers module actions to admin.
 */
const ADMIN_USERS_PERMISSIONS = [
  'users.read',
  'users.create',
  'users.update',
  'users.status',
  'users.delete',
];

const permissionList = ADMIN_USERS_PERMISSIONS.map((code) => `'${code}'`).join(', ');

export class GrantAdminUsersStatusPermission1786026000000 implements MigrationInterface {
  name = 'GrantAdminUsersStatusPermission1786026000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id"
      FROM "roles" r
      JOIN "permissions" p
        ON p."code" IN (${permissionList})
        AND p."deleted_at" IS NULL
      WHERE r."deleted_at" IS NULL
        AND (
          r."slug" = 'admin'
          OR r."id" IN (
            SELECT au."role_id"
            FROM "admin_users" au
            WHERE au."role" = 'admin'
              AND au."deleted_at" IS NULL
              AND au."role_id" IS NOT NULL
          )
        )
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions" rp
      USING "roles" r, "permissions" p
      WHERE rp."role_id" = r."id"
        AND rp."permission_id" = p."id"
        AND r."slug" = 'admin'
        AND p."code" IN (${permissionList})
    `);
  }
}
