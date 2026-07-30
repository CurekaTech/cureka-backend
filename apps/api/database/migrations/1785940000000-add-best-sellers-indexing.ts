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
    refId: 'PER00000275',
    name: 'View Best Sellers Indexing',
    code: 'best_sellers.read',
    module: 'best_sellers',
    action: 'read',
  },
  {
    refId: 'PER00000276',
    name: 'Create Best Sellers Indexing',
    code: 'best_sellers.create',
    module: 'best_sellers',
    action: 'create',
  },
  {
    refId: 'PER00000277',
    name: 'Update Best Sellers Indexing',
    code: 'best_sellers.update',
    module: 'best_sellers',
    action: 'update',
  },
  {
    refId: 'PER00000278',
    name: 'Change Best Sellers Indexing Status',
    code: 'best_sellers.status',
    module: 'best_sellers',
    action: 'status',
  },
  {
    refId: 'PER00000279',
    name: 'Delete Best Sellers Indexing',
    code: 'best_sellers.delete',
    module: 'best_sellers',
    action: 'delete',
  },
];

export class AddBestSellersIndexing1785940000000 implements MigrationInterface {
  name = 'AddBestSellersIndexing1785940000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "categories"
      ADD COLUMN IF NOT EXISTS "bestseller_sort_index" integer
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_categories_bestseller_sort_index"
      ON "categories" ("bestseller_sort_index")
    `);

    await queryRunner.query(`
      ALTER TABLE "product_tag_mappings"
      ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0
    `);

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

    await queryRunner.query(`
      ALTER TABLE "product_tag_mappings"
      DROP COLUMN IF EXISTS "sort_order"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_categories_bestseller_sort_index"
    `);

    await queryRunner.query(`
      ALTER TABLE "categories"
      DROP COLUMN IF EXISTS "bestseller_sort_index"
    `);
  }
}
