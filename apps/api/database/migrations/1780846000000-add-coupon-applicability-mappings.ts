import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCouponApplicabilityMappings1780846000000 implements MigrationInterface {
  name = 'AddCouponApplicabilityMappings1780846000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."coupons_applicability_scope_enum" AS ENUM ('all', 'categories', 'products', 'brands')
    `);

    await queryRunner.query(`
      ALTER TABLE "coupons"
      ADD COLUMN "applicability_scope" "public"."coupons_applicability_scope_enum" NOT NULL DEFAULT 'all'
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coupons_applicability_scope" ON "coupons" ("applicability_scope")
    `);

    await queryRunner.query(`
      CREATE TABLE "coupon_categories" (
        "coupon_id"   uuid NOT NULL,
        "category_id" uuid NOT NULL,
        CONSTRAINT "PK_coupon_categories" PRIMARY KEY ("coupon_id", "category_id"),
        CONSTRAINT "FK_coupon_categories_coupon_id" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_coupon_categories_category_id" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coupon_categories_category_id" ON "coupon_categories" ("category_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "coupon_products" (
        "coupon_id"  uuid NOT NULL,
        "product_id" uuid NOT NULL,
        CONSTRAINT "PK_coupon_products" PRIMARY KEY ("coupon_id", "product_id"),
        CONSTRAINT "FK_coupon_products_coupon_id" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_coupon_products_product_id" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coupon_products_product_id" ON "coupon_products" ("product_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "coupon_brands" (
        "coupon_id" uuid NOT NULL,
        "brand_id"  uuid NOT NULL,
        CONSTRAINT "PK_coupon_brands" PRIMARY KEY ("coupon_id", "brand_id"),
        CONSTRAINT "FK_coupon_brands_coupon_id" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_coupon_brands_brand_id" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coupon_brands_brand_id" ON "coupon_brands" ("brand_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_coupon_brands_brand_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coupon_brands"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_coupon_products_product_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coupon_products"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_coupon_categories_category_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coupon_categories"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_coupons_applicability_scope"`);
    await queryRunner.query(`ALTER TABLE "coupons" DROP COLUMN IF EXISTS "applicability_scope"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."coupons_applicability_scope_enum"`);
  }
}
