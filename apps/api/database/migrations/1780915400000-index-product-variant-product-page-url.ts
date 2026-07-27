import { MigrationInterface, QueryRunner } from 'typeorm';

export class IndexProductVariantProductPageUrl1780915400000 implements MigrationInterface {
  name = 'IndexProductVariantProductPageUrl1780915400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_variants_product_page_url"
      ON "product_variants" ("product_page_url")
      WHERE "product_page_url" IS NOT NULL AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_product_variants_product_page_url"
    `);
  }
}
