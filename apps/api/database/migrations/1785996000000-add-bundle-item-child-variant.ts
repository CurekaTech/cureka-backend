import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBundleItemChildVariant1785996000000 implements MigrationInterface {
  name = 'AddBundleItemChildVariant1785996000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_bundles"
      ADD COLUMN IF NOT EXISTS "child_variant_id" uuid
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_product_bundles_child_variant'
        ) THEN
          ALTER TABLE "product_bundles"
          ADD CONSTRAINT "FK_product_bundles_child_variant"
          FOREIGN KEY ("child_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_bundles_child_variant_id"
      ON "product_bundles" ("child_variant_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_product_bundles_child_variant_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_bundles"
      DROP CONSTRAINT IF EXISTS "FK_product_bundles_child_variant"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_bundles"
      DROP COLUMN IF EXISTS "child_variant_id"
    `);
  }
}
