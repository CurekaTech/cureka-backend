import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enables the Hero Banner as a managed home section. The `heroBanner` enum value
 * already exists in `home_sections_type_enum`; previously it was intentionally kept
 * out of the table. This restores any soft-deleted hero row and inserts one if none
 * is active, at the top of the homepage (section_index 0).
 */
export class AddHeroBannerHomeSection1780846400000 implements MigrationInterface {
  name = 'AddHeroBannerHomeSection1780846400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "home_sections"
      SET "deleted_at" = NULL, "status" = 'active'
      WHERE "type" = 'heroBanner' AND "deleted_at" IS NOT NULL
    `);

    await queryRunner.query(`
      INSERT INTO "home_sections" ("ref_id", "title", "slug", "type", "section_index", "status", "created_by")
      SELECT 'HER20260001', 'Hero Banner', 'hero-banner', 'heroBanner', 0, 'active', 'system'
      WHERE NOT EXISTS (
        SELECT 1 FROM "home_sections"
        WHERE "type" = 'heroBanner' AND "deleted_at" IS NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "home_sections"
      SET "deleted_at" = now()
      WHERE "type" = 'heroBanner' AND "deleted_at" IS NULL
    `);
  }
}
