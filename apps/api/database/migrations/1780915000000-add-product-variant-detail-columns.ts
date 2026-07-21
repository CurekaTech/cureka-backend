import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductVariantDetailColumns1780915000000 implements MigrationInterface {
  name = 'AddProductVariantDetailColumns1780915000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN IF NOT EXISTS "display_name" character varying(500),
      ADD COLUMN IF NOT EXISTS "description" text,
      ADD COLUMN IF NOT EXISTS "product_information" jsonb NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS "faqs" jsonb NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS "meta_title" character varying(255),
      ADD COLUMN IF NOT EXISTS "meta_description" text,
      ADD COLUMN IF NOT EXISTS "meta_keywords" jsonb,
      ADD COLUMN IF NOT EXISTS "components" text,
      ADD COLUMN IF NOT EXISTS "subscription_enabled" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "cod_available" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "emi_available" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "return_allowed" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "return_policy" text,
      ADD COLUMN IF NOT EXISTS "return_window_days" integer,
      ADD COLUMN IF NOT EXISTS "replace_allowed" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "replace_window_days" integer,
      ADD COLUMN IF NOT EXISTS "manufacturer_id" uuid,
      ADD COLUMN IF NOT EXISTS "packer_id" uuid,
      ADD COLUMN IF NOT EXISTS "importer_id" uuid,
      ADD COLUMN IF NOT EXISTS "manufacturer_address" text,
      ADD COLUMN IF NOT EXISTS "packer_address" text,
      ADD COLUMN IF NOT EXISTS "importer_address" text,
      ADD COLUMN IF NOT EXISTS "country_of_origin_id" uuid,
      ADD COLUMN IF NOT EXISTS "expires_in_months" integer,
      ADD COLUMN IF NOT EXISTS "size_chart" jsonb,
      ADD COLUMN IF NOT EXISTS "single_product_url" character varying(1000),
      ADD COLUMN IF NOT EXISTS "health_concern_ref_ids" jsonb NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS "wellness_goal_ref_ids" jsonb NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS "tag_names" jsonb NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS "category_filters" jsonb NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS "pack_metadata" jsonb NOT NULL DEFAULT '[]'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_variants_manufacturer_id"
      ON "product_variants" ("manufacturer_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_variants_packer_id"
      ON "product_variants" ("packer_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_variants_importer_id"
      ON "product_variants" ("importer_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_variants_country_of_origin_id"
      ON "product_variants" ("country_of_origin_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_variants_country_of_origin_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_variants_importer_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_variants_packer_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_variants_manufacturer_id"`);
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      DROP COLUMN IF EXISTS "pack_metadata",
      DROP COLUMN IF EXISTS "category_filters",
      DROP COLUMN IF EXISTS "tag_names",
      DROP COLUMN IF EXISTS "wellness_goal_ref_ids",
      DROP COLUMN IF EXISTS "health_concern_ref_ids",
      DROP COLUMN IF EXISTS "single_product_url",
      DROP COLUMN IF EXISTS "size_chart",
      DROP COLUMN IF EXISTS "expires_in_months",
      DROP COLUMN IF EXISTS "country_of_origin_id",
      DROP COLUMN IF EXISTS "importer_address",
      DROP COLUMN IF EXISTS "packer_address",
      DROP COLUMN IF EXISTS "manufacturer_address",
      DROP COLUMN IF EXISTS "importer_id",
      DROP COLUMN IF EXISTS "packer_id",
      DROP COLUMN IF EXISTS "manufacturer_id",
      DROP COLUMN IF EXISTS "replace_window_days",
      DROP COLUMN IF EXISTS "replace_allowed",
      DROP COLUMN IF EXISTS "return_window_days",
      DROP COLUMN IF EXISTS "return_policy",
      DROP COLUMN IF EXISTS "return_allowed",
      DROP COLUMN IF EXISTS "emi_available",
      DROP COLUMN IF EXISTS "cod_available",
      DROP COLUMN IF EXISTS "subscription_enabled",
      DROP COLUMN IF EXISTS "components",
      DROP COLUMN IF EXISTS "meta_keywords",
      DROP COLUMN IF EXISTS "meta_description",
      DROP COLUMN IF EXISTS "meta_title",
      DROP COLUMN IF EXISTS "faqs",
      DROP COLUMN IF EXISTS "product_information",
      DROP COLUMN IF EXISTS "description",
      DROP COLUMN IF EXISTS "display_name"
    `);
  }
}
