import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVariantOutOfStockFlag1785920000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN IF NOT EXISTS "out_of_stock" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_variants_out_of_stock"
      ON "product_variants" ("out_of_stock")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_variants_out_of_stock"`);
    await queryRunner.query(`ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "out_of_stock"`);
  }
}
