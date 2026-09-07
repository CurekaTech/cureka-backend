import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCmsPagePredefinedKey1785972000000 implements MigrationInterface {
  name = 'AddCmsPagePredefinedKey1785972000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cms_pages"
      ADD COLUMN IF NOT EXISTS "predefined_key" varchar(100)
    `);

    await queryRunner.query(`
      UPDATE "cms_pages"
      SET "predefined_key" = CASE
        WHEN LOWER(TRIM("slug")) = 'about-cureka' OR LOWER(TRIM("title")) = 'about cureka' OR "ref_id" = 'CMP20260701'
          THEN 'aboutCureka'
        WHEN LOWER(TRIM("slug")) = 'privacy-policy' OR LOWER(TRIM("title")) = 'privacy policy' OR "ref_id" = 'CMP20260702'
          THEN 'privacyPolicy'
        WHEN LOWER(TRIM("slug")) = 'terms-and-conditions' OR LOWER(TRIM("title")) = 'terms & conditions' OR "ref_id" = 'CMP20260703'
          THEN 'termsAndConditions'
        WHEN LOWER(TRIM("slug")) = 'returns-refunds' OR LOWER(TRIM("title")) IN ('returns & refunds', 'returns and refunds') OR "ref_id" = 'CMP20260704'
          THEN 'returnsRefunds'
        WHEN LOWER(TRIM("slug")) = 'shipping-policy' OR LOWER(TRIM("title")) = 'shipping policy' OR "ref_id" = 'CMP20260705'
          THEN 'shippingPolicy'
        ELSE "predefined_key"
      END
      WHERE "is_predefined" = true
        AND "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cms_pages_predefined_key"
      ON "cms_pages" ("predefined_key")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_cms_pages_predefined_key"
    `);

    await queryRunner.query(`
      ALTER TABLE "cms_pages"
      DROP COLUMN IF EXISTS "predefined_key"
    `);
  }
}
