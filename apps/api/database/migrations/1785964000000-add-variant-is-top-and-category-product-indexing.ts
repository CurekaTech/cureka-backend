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
    refId: 'PER00000331',
    name: 'View Category Product Indexing',
    code: 'category_product.read',
    module: 'category_product',
    action: 'read',
  },
  {
    refId: 'PER00000332',
    name: 'Create Category Product Indexing',
    code: 'category_product.create',
    module: 'category_product',
    action: 'create',
  },
  {
    refId: 'PER00000333',
    name: 'Update Category Product Indexing',
    code: 'category_product.update',
    module: 'category_product',
    action: 'update',
  },
  {
    refId: 'PER00000334',
    name: 'Change Category Product Indexing Status',
    code: 'category_product.status',
    module: 'category_product',
    action: 'status',
  },
  {
    refId: 'PER00000335',
    name: 'Delete Category Product Indexing',
    code: 'category_product.delete',
    module: 'category_product',
    action: 'delete',
  },
];

export class AddVariantIsTopAndCategoryProductIndexing1785964000000
  implements MigrationInterface
{
  name = 'AddVariantIsTopAndCategoryProductIndexing1785964000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN IF NOT EXISTS "is_top" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_variants_is_top"
      ON "product_variants" ("is_top")
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
      DROP INDEX IF EXISTS "IDX_product_variants_is_top"
    `);

    await queryRunner.query(`
      ALTER TABLE "product_variants"
      DROP COLUMN IF EXISTS "is_top"
    `);
  }
}
