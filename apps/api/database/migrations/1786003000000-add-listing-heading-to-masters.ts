import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddListingHeadingToMasters1786003000000 implements MigrationInterface {
  name = 'AddListingHeadingToMasters1786003000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "brands"
      ADD COLUMN IF NOT EXISTS "listing_heading" text
    `);
    await queryRunner.query(`
      ALTER TABLE "categories"
      ADD COLUMN IF NOT EXISTS "listing_heading" text
    `);
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      ADD COLUMN IF NOT EXISTS "listing_heading" text
    `);
    await queryRunner.query(`
      ALTER TABLE "wellness_goals"
      ADD COLUMN IF NOT EXISTS "listing_heading" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "wellness_goals" DROP COLUMN IF EXISTS "listing_heading"`);
    await queryRunner.query(`ALTER TABLE "health_concerns" DROP COLUMN IF EXISTS "listing_heading"`);
    await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN IF EXISTS "listing_heading"`);
    await queryRunner.query(`ALTER TABLE "brands" DROP COLUMN IF EXISTS "listing_heading"`);
  }
}
