import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductVariantExternalProductId1780909000000 implements MigrationInterface {
  name = 'AddProductVariantExternalProductId1780909000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN IF NOT EXISTS "external_product_id" character varying(255)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_variants_external_product_id"
      ON "product_variants" ("external_product_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_product_variants_external_product_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      DROP COLUMN IF EXISTS "external_product_id"
    `);
  }
}
