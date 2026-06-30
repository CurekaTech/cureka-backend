import { MigrationInterface, QueryRunner } from 'typeorm';

const userRoles = [
  {
    refId: 'ROL00000004',
    name: 'Customer',
    slug: 'customer',
    description: 'Default website customer role.',
  },
  {
    refId: 'ROL00000005',
    name: 'Vendor',
    slug: 'vendor',
    description: 'Vendor staff user role.',
  },
  {
    refId: 'ROL00000006',
    name: 'Telecaller',
    slug: 'telecaller',
    description: 'Telecaller staff user role.',
  },
  {
    refId: 'ROL00000007',
    name: 'Vendor Manager',
    slug: 'vendor_manager',
    description: 'Vendor manager staff user role.',
  },
  {
    refId: 'ROL00000008',
    name: 'Warehouse Staff',
    slug: 'warehouse_staff',
    description: 'Warehouse staff user role.',
  },
  {
    refId: 'ROL00000009',
    name: 'Delivery Partner',
    slug: 'delivery_partner',
    description: 'Delivery partner user role.',
  },
];

export class AddRoleIdToUsers1780836000000 implements MigrationInterface {
  name = 'AddRoleIdToUsers1780836000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const role of userRoles) {
      await queryRunner.query(
        `
          INSERT INTO "roles" ("ref_id", "name", "slug", "description", "status", "is_system", "created_by")
          SELECT $1::varchar, $2::varchar, $3::varchar, $4::text, 'active', true, 'system'
          WHERE NOT EXISTS (
            SELECT 1 FROM "roles" WHERE LOWER("slug") = LOWER($3::varchar) AND "deleted_at" IS NULL
          )
        `,
        [role.refId, role.name, role.slug, role.description],
      );
    }

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "role_id" uuid
    `);

    await queryRunner.query(`
      UPDATE "users" u
      SET "role_id" = r."id"
      FROM "roles" r
      WHERE u."role_id" IS NULL
        AND r."slug" = u."role"::text
        AND r."deleted_at" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "FK_users_role_id"
      FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_role_id" ON "users" ("role_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "admin_users"
      ADD COLUMN IF NOT EXISTS "role_id" uuid
    `);

    await queryRunner.query(`
      UPDATE "admin_users" au
      SET "role_id" = r."id"
      FROM "roles" r
      WHERE au."role_id" IS NULL
        AND r."slug" = au."role"::text
        AND r."deleted_at" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "admin_users"
      ADD CONSTRAINT "FK_admin_users_role_id"
      FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_admin_users_role_id" ON "admin_users" ("role_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_admin_users_role_id"`);
    await queryRunner.query(
      `ALTER TABLE "admin_users" DROP CONSTRAINT IF EXISTS "FK_admin_users_role_id"`,
    );
    await queryRunner.query(`ALTER TABLE "admin_users" DROP COLUMN IF EXISTS "role_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_role_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_users_role_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "role_id"`);

    await queryRunner.query(`
      DELETE FROM "roles"
      WHERE "slug" IN (
        'customer',
        'vendor',
        'telecaller',
        'vendor_manager',
        'warehouse_staff',
        'delivery_partner'
      )
      AND "created_by" = 'system'
    `);
  }
}
