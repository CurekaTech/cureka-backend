import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBrandContentVisibilityFlags1785974000000 implements MigrationInterface {
  name = 'AddBrandContentVisibilityFlags1785974000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "brands"
      ADD COLUMN IF NOT EXISTS "show_banner" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      ADD COLUMN IF NOT EXISTS "show_video" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      ADD COLUMN IF NOT EXISTS "show_featured_banner" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      ADD COLUMN IF NOT EXISTS "show_promotional_banner" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      ADD COLUMN IF NOT EXISTS "show_secondary_banner" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      ADD COLUMN IF NOT EXISTS "show_secondary_video" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      ADD COLUMN IF NOT EXISTS "show_offer_banner" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      ADD COLUMN IF NOT EXISTS "show_brand_highlights" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      ADD COLUMN IF NOT EXISTS "show_description" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "brands"
      DROP COLUMN IF EXISTS "show_description"
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      DROP COLUMN IF EXISTS "show_brand_highlights"
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      DROP COLUMN IF EXISTS "show_offer_banner"
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      DROP COLUMN IF EXISTS "show_secondary_video"
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      DROP COLUMN IF EXISTS "show_secondary_banner"
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      DROP COLUMN IF EXISTS "show_promotional_banner"
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      DROP COLUMN IF EXISTS "show_featured_banner"
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      DROP COLUMN IF EXISTS "show_video"
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      DROP COLUMN IF EXISTS "show_banner"
    `);
  }
}
