import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendProductsSheetFields1780513000000 implements MigrationInterface {
  name = 'ExtendProductsSheetFields1780513000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."products_status_enum"
      ADD VALUE IF NOT EXISTS 'pending_review'
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."products_status_enum"
      ADD VALUE IF NOT EXISTS 'rejected'
    `);

    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "product_nature_id" DROP NOT NULL`);

    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "highlights" text,
      ADD COLUMN IF NOT EXISTS "expert_advice" text,
      ADD COLUMN IF NOT EXISTS "key_ingredients" text,
      ADD COLUMN IF NOT EXISTS "other_ingredients" text,
      ADD COLUMN IF NOT EXISTS "preventive_notes" text,
      ADD COLUMN IF NOT EXISTS "accessories_specifications" text,
      ADD COLUMN IF NOT EXISTS "directions_of_use" text,
      ADD COLUMN IF NOT EXISTS "feeding_table" text,
      ADD COLUMN IF NOT EXISTS "safety_information" text,
      ADD COLUMN IF NOT EXISTS "product_weight" character varying(100),
      ADD COLUMN IF NOT EXISTS "product_dimensions" character varying(100),
      ADD COLUMN IF NOT EXISTS "country_of_origin_id" uuid,
      ADD COLUMN IF NOT EXISTS "expires_in_months" integer,
      ADD COLUMN IF NOT EXISTS "return_allowed" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "return_policy" text,
      ADD COLUMN IF NOT EXISTS "rejection_reason" text
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      ADD CONSTRAINT "FK_products_country_of_origin"
      FOREIGN KEY ("country_of_origin_id") REFERENCES "countries"("id")
      ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_attribute_mappings" (
        "product_id"   uuid NOT NULL,
        "attribute_id" uuid NOT NULL,
        CONSTRAINT "PK_product_attribute_mappings" PRIMARY KEY ("product_id", "attribute_id"),
        CONSTRAINT "FK_product_attribute_mappings_product"
          FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_attribute_mappings_attribute"
          FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_attribute_mappings_product_id"
      ON "product_attribute_mappings" ("product_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "product_attribute_mappings"`);
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "FK_products_country_of_origin"`,
    );
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "rejection_reason",
      DROP COLUMN IF EXISTS "return_policy",
      DROP COLUMN IF EXISTS "return_allowed",
      DROP COLUMN IF EXISTS "expires_in_months",
      DROP COLUMN IF EXISTS "country_of_origin_id",
      DROP COLUMN IF EXISTS "product_dimensions",
      DROP COLUMN IF EXISTS "product_weight",
      DROP COLUMN IF EXISTS "safety_information",
      DROP COLUMN IF EXISTS "feeding_table",
      DROP COLUMN IF EXISTS "directions_of_use",
      DROP COLUMN IF EXISTS "accessories_specifications",
      DROP COLUMN IF EXISTS "preventive_notes",
      DROP COLUMN IF EXISTS "other_ingredients",
      DROP COLUMN IF EXISTS "key_ingredients",
      DROP COLUMN IF EXISTS "expert_advice",
      DROP COLUMN IF EXISTS "highlights"
    `);
  }
}
