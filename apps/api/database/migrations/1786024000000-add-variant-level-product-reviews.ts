import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVariantLevelProductReviews1786024000000 implements MigrationInterface {
  name = 'AddVariantLevelProductReviews1786024000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_reviews"
        ADD COLUMN "variant_id" uuid,
        ADD COLUMN "variant_sku" character varying(100),
        ADD COLUMN "review_description" text,
        ADD COLUMN "customer_age" text,
        ADD COLUMN "customer_location" text,
        ADD COLUMN "import_key" character varying(64)
    `);

    await queryRunner.query(`
      ALTER TABLE "product_reviews"
        ALTER COLUMN "user_id" DROP NOT NULL,
        ALTER COLUMN "review" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "product_reviews"
        ADD CONSTRAINT "FK_product_reviews_variant_id"
        FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id")
        ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "product_reviews"
        ADD CONSTRAINT "UQ_product_reviews_import_key" UNIQUE ("import_key")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_reviews_variant_id" ON "product_reviews" ("variant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_product_reviews_variant_status" ON "product_reviews" ("variant_id", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        null_user_count integer;
      BEGIN
        SELECT COUNT(*)::int INTO null_user_count
        FROM "product_reviews"
        WHERE "user_id" IS NULL;

        IF null_user_count > 0 THEN
          RAISE EXCEPTION
            'Cannot roll back variant-level product reviews: % product_reviews rows have a null user_id. Remove imported reviews before rolling back.',
            null_user_count;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "product_reviews"
        ALTER COLUMN "user_id" SET NOT NULL,
        ALTER COLUMN "review" SET NOT NULL
    `);

    await queryRunner.query(`
      DROP INDEX "public"."IDX_product_reviews_variant_status"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."IDX_product_reviews_variant_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_reviews" DROP CONSTRAINT "UQ_product_reviews_import_key"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_reviews" DROP CONSTRAINT "FK_product_reviews_variant_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_reviews"
        DROP COLUMN "import_key",
        DROP COLUMN "customer_location",
        DROP COLUMN "customer_age",
        DROP COLUMN "review_description",
        DROP COLUMN "variant_sku",
        DROP COLUMN "variant_id"
    `);
  }
}
