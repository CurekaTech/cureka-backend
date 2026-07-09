import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductBulkUploadFields1780901000000 implements MigrationInterface {
  name = 'AddProductBulkUploadFields1780901000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "external_product_id" character varying(255),
      ADD COLUMN IF NOT EXISTS "single_product_url" character varying(1000),
      ADD COLUMN IF NOT EXISTS "pack_metadata" jsonb NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS "manufacturer_address" text
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_products_external_product_id"
      ON "products" ("external_product_id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_products_external_product_id_active"
      ON "products" ("external_product_id")
      WHERE "external_product_id" IS NOT NULL AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_products_external_product_id_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_external_product_id"`);
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "manufacturer_address",
      DROP COLUMN IF EXISTS "pack_metadata",
      DROP COLUMN IF EXISTS "single_product_url",
      DROP COLUMN IF EXISTS "external_product_id"
    `);
  }
}
