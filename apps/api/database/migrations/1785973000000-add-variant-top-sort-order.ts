import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVariantTopSortOrder1785973000000 implements MigrationInterface {
  name = 'AddVariantTopSortOrder1785973000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN IF NOT EXISTS "top_sort_order" integer
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_variants_top_sort_order"
      ON "product_variants" ("top_sort_order")
    `);

    await queryRunner.query(`
      WITH ranked AS (
        SELECT
          pv.id,
          ROW_NUMBER() OVER (
            ORDER BY pv.updated_at ASC, pv.created_at ASC, pv.id ASC
          ) AS seq
        FROM product_variants pv
        WHERE pv.deleted_at IS NULL
          AND pv.is_top = true
          AND pv.top_sort_order IS NULL
      )
      UPDATE product_variants pv
      SET top_sort_order = ranked.seq
      FROM ranked
      WHERE pv.id = ranked.id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_product_variants_top_sort_order"
    `);

    await queryRunner.query(`
      ALTER TABLE "product_variants"
      DROP COLUMN IF EXISTS "top_sort_order"
    `);
  }
}
