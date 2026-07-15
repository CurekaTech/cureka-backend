import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds custom home-section types (banner / productSlider / categorySlider),
 * content columns, and replaces the global unique-type index with a partial
 * unique index that only applies to system (non-custom) types.
 *
 * Important: PostgreSQL forbids using newly added enum values in the same
 * transaction (55P04). The unique index therefore whitelists existing system
 * types instead of excluding the new custom ones.
 */
export class AddCustomHomeSectionTypes1780911000000 implements MigrationInterface {
  name = 'AddCustomHomeSectionTypes1780911000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "home_sections_type_enum" ADD VALUE IF NOT EXISTS 'banner'
    `);
    await queryRunner.query(`
      ALTER TYPE "home_sections_type_enum" ADD VALUE IF NOT EXISTS 'productSlider'
    `);
    await queryRunner.query(`
      ALTER TYPE "home_sections_type_enum" ADD VALUE IF NOT EXISTS 'categorySlider'
    `);

    await queryRunner.query(`
      ALTER TABLE "home_sections"
      ADD COLUMN IF NOT EXISTS "banners" jsonb,
      ADD COLUMN IF NOT EXISTS "product_ref_ids" jsonb,
      ADD COLUMN IF NOT EXISTS "category_ref_ids" jsonb
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_home_sections_type_active"`);

    // Whitelist system types only — do not reference newly added enum values here.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_home_sections_system_type_active"
      ON "home_sections" ("type")
      WHERE "deleted_at" IS NULL
        AND "type" IN (
          'heroBanner',
          'builtByDoctorsBanner',
          'shopByCategory',
          'shopByWellnessGoals',
          'bestSellers',
          'expertCuratedBundles',
          'festivalBanners',
          'brandBanners',
          'brandsWeTrust',
          'curatedWellnessEssentials',
          'consultDoctors',
          'healthReads',
          'watchAndShop'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_home_sections_system_type_active"`);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_home_sections_type_active"
      ON "home_sections" ("type")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "home_sections"
      DROP COLUMN IF EXISTS "banners",
      DROP COLUMN IF EXISTS "product_ref_ids",
      DROP COLUMN IF EXISTS "category_ref_ids"
    `);
  }
}
