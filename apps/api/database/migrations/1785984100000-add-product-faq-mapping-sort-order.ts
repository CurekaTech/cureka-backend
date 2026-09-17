import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductFaqMappingSortOrder1785984100000 implements MigrationInterface {
  name = 'AddProductFaqMappingSortOrder1785984100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_faq_mappings"
      ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_faq_mappings"
      DROP COLUMN IF EXISTS "sort_order"
    `);
  }
}
