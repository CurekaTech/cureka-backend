import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductVariantProductPageUrl1780915300000 implements MigrationInterface {
  name = 'AddProductVariantProductPageUrl1780915300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN IF NOT EXISTS "product_page_url" character varying(1000)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      DROP COLUMN IF EXISTS "product_page_url"
    `);
  }
}
