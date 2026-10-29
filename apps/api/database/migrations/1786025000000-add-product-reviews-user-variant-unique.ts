import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductReviewsUserVariantUnique1786025000000 implements MigrationInterface {
  name = 'AddProductReviewsUserVariantUnique1786025000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_product_reviews_user_variant_active"
      ON "product_reviews" ("user_id", "variant_id")
      WHERE "user_id" IS NOT NULL AND "variant_id" IS NOT NULL AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_product_reviews_user_variant_active"
    `);
  }
}
