import { MigrationInterface, QueryRunner } from 'typeorm';

const ORDER_PERMISSIONS = ['orders.read', 'orders.create', 'orders.update', 'orders.status'];

export class GrantAdminOrderPermissions1786004000000 implements MigrationInterface {
  name = 'GrantAdminOrderPermissions1786004000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id"
      FROM "roles" r
      JOIN "permissions" p
        ON p."code" IN (${ORDER_PERMISSIONS.map((code) => `'${code}'`).join(', ')})
        AND p."deleted_at" IS NULL
      WHERE r."slug" = 'admin'
        AND r."deleted_at" IS NULL
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
        AND p."code" IN (${ORDER_PERMISSIONS.map((code) => `'${code}'`).join(', ')})
    `);
  }
}
