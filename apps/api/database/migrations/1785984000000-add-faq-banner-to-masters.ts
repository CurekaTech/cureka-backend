import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFaqBannerToMasters1785984000000 implements MigrationInterface {
  name = 'AddFaqBannerToMasters1785984000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      ADD COLUMN IF NOT EXISTS "faq_banner" jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "wellness_goals"
      ADD COLUMN IF NOT EXISTS "faq_banner" jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "categories"
      ADD COLUMN IF NOT EXISTS "faq_banner" jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      ADD COLUMN IF NOT EXISTS "faq_banner" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "brands"
      DROP COLUMN IF EXISTS "faq_banner"
    `);
    await queryRunner.query(`
      ALTER TABLE "categories"
      DROP COLUMN IF EXISTS "faq_banner"
    `);
    await queryRunner.query(`
      ALTER TABLE "wellness_goals"
      DROP COLUMN IF EXISTS "faq_banner"
    `);
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      DROP COLUMN IF EXISTS "faq_banner"
    `);
  }
}
