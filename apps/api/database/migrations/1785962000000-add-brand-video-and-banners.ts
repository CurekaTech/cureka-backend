import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBrandVideoAndBanners1785962000000 implements MigrationInterface {
  name = 'AddBrandVideoAndBanners1785962000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "brands"
      ADD COLUMN IF NOT EXISTS "video" jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      ADD COLUMN IF NOT EXISTS "featured_banner" jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      ADD COLUMN IF NOT EXISTS "promotional_banner" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "brands"
      DROP COLUMN IF EXISTS "promotional_banner"
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      DROP COLUMN IF EXISTS "featured_banner"
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      DROP COLUMN IF EXISTS "video"
    `);
  }
}
