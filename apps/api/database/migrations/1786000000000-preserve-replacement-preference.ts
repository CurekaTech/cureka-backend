import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Keeps the customer's replacement preference after admin confirms a variant.
 * Does not copy a confirmed selection back into the preference: once
 * replacement_settlement is set, the original preference may already have
 * been overwritten and cannot be recovered.
 */
export class PreserveReplacementPreference1786000000000 implements MigrationInterface {
  name = 'PreserveReplacementPreference1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "return_request_items"
        ADD COLUMN IF NOT EXISTS "preferred_replacement_variant_id" uuid,
        ADD COLUMN IF NOT EXISTS "preferred_replacement_sku" varchar(100),
        ADD COLUMN IF NOT EXISTS "preferred_replacement_product_name" varchar(500),
        ADD COLUMN IF NOT EXISTS "preferred_replacement_variant_name" varchar(500),
        ADD COLUMN IF NOT EXISTS "replacement_product_name" varchar(500),
        ADD COLUMN IF NOT EXISTS "replacement_variant_name" varchar(500)
    `);

    await queryRunner.query(`
      UPDATE "return_request_items" AS item
      SET
        "preferred_replacement_variant_id" = item."replacement_variant_id",
        "preferred_replacement_sku" = item."replacement_sku"
      FROM "return_requests" AS request
      WHERE request."id" = item."return_request_id"
        AND request."replacement_settlement" IS NULL
        AND item."preferred_replacement_variant_id" IS NULL
        AND item."replacement_variant_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "return_request_items"
        DROP COLUMN IF EXISTS "replacement_variant_name",
        DROP COLUMN IF EXISTS "replacement_product_name",
        DROP COLUMN IF EXISTS "preferred_replacement_variant_name",
        DROP COLUMN IF EXISTS "preferred_replacement_product_name",
        DROP COLUMN IF EXISTS "preferred_replacement_sku",
        DROP COLUMN IF EXISTS "preferred_replacement_variant_id"
    `);
  }
}
