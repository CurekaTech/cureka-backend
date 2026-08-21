import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBrandSecondaryMediaAndHighlights1785965000000 implements MigrationInterface {
  name = 'AddBrandSecondaryMediaAndHighlights1785965000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "brands"
      ADD COLUMN IF NOT EXISTS "secondary_banner" jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      ADD COLUMN IF NOT EXISTS "secondary_video" jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      ADD COLUMN IF NOT EXISTS "brand_highlights" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "brands"
      DROP COLUMN IF EXISTS "brand_highlights"
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      DROP COLUMN IF EXISTS "secondary_video"
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      DROP COLUMN IF EXISTS "secondary_banner"
    `);
  }
}
