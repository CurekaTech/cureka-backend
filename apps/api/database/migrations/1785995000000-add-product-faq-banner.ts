import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductFaqBanner1785995000000 implements MigrationInterface {
  name = 'AddProductFaqBanner1785995000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "faq_banner" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "faq_banner"
    `);
  }
}
