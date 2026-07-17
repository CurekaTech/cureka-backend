import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductVariantSearchTags1780914000000 implements MigrationInterface {
  name = 'AddProductVariantSearchTags1780914000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN IF NOT EXISTS "search_tags" jsonb DEFAULT '[]'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      DROP COLUMN IF EXISTS "search_tags"
    `);
  }
}
