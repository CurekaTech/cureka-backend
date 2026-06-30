import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add approve and reject to permissions_action_enum and seed
 * product.approve / product.reject permissions.
 */
export class AddApproveRejectProductPermissions1780839000000 implements MigrationInterface {
  name = 'AddApproveRejectProductPermissions1780839000000';

  /**
   * IMPORTANT: transaction = false is required here.
   * PostgreSQL does NOT allow a newly added enum value to be used in the same
   * transaction where it was created. Disabling the transaction wrapper means
   * each statement auto-commits, so the new values ('approve', 'reject') are
   * visible to the subsequent INSERT statements.
   */
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Extend the PostgreSQL enum with the two new values
    await queryRunner.query(`ALTER TYPE "public"."permissions_action_enum" ADD VALUE IF NOT EXISTS 'approve'`);
    await queryRunner.query(`ALTER TYPE "public"."permissions_action_enum" ADD VALUE IF NOT EXISTS 'reject'`);

    // 2. Seed the two new permissions (idempotent — skips if already present)
    const newPermissions = [
      { refId: 'PER00000084', code: 'products.approve', name: 'Approve Products', module: 'products', action: 'approve' },
      { refId: 'PER00000085', code: 'products.reject',  name: 'Reject Products',  module: 'products', action: 'reject'  },
    ];

    for (const p of newPermissions) {
      await queryRunner.query(
        `
          INSERT INTO "permissions" ("ref_id", "code", "name", "module", "action", "status", "created_by")
          SELECT $1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::permissions_action_enum, 'active', 'system'
          WHERE NOT EXISTS (
            SELECT 1 FROM "permissions" WHERE LOWER("code") = LOWER($2::varchar) AND "deleted_at" IS NULL
          )
        `,
        [p.refId, p.code, p.name, p.module, p.action],
      );
    }

    // 3. Assign both new permissions to the super_admin role
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id"
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r."slug" = 'super_admin'
        AND p."code" IN ('products.approve', 'products.reject')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove role-permission links
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "permission_id" IN (
        SELECT "id" FROM "permissions"
        WHERE "code" IN ('products.approve', 'products.reject')
      )
    `);

    // Remove the seeded permissions
    await queryRunner.query(`
      DELETE FROM "permissions"
      WHERE "code" IN ('products.approve', 'products.reject')
        AND "created_by" = 'system'
    `);

    // NOTE: PostgreSQL does not support removing values from an existing enum type.
    // The 'approve' and 'reject' enum values will remain in the DB but will be unused.
  }
}
