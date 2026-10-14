import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Strings the admin panel matches in login and /auth/admin/me `data.permissions`.
 * Returns and refunds were already on the role slug `admin`. A staff account uses
 * whatever role is stored on admin_users.role_id, so this copies the same strings there.
 */
const ADMIN_PANEL_PERMISSIONS = [
  'returns.read',
  'returns.create',
  'returns.update',
  'returns.approve',
  'returns.reject',
  'returns.status',
  'refund_requests.read',
  'refund_requests.update',
  'refund_requests.approve',
  'refund_requests.reject',
  'refund_requests.status',
  'orders.read',
  'orders.update',
];

const permissionList = ADMIN_PANEL_PERMISSIONS.map((code) => `'${code}'`).join(', ');

export class GrantAssignedAdminOrderPermissions1786005000000 implements MigrationInterface {
  name = 'GrantAssignedAdminOrderPermissions1786005000000';

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
        AND r."slug" <> 'admin'
        AND r."id" IN (
          SELECT au."role_id"
          FROM "admin_users" au
          WHERE au."role" = 'admin'
            AND au."deleted_at" IS NULL
            AND au."role_id" IS NOT NULL
        )
        AND p."code" IN (${permissionList})
    `);
  }
}
