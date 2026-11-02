import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One active review per customer per product (was per variant).
 * Soft-deletes duplicate rows before creating the new unique index.
 */
export class ProductReviewsOnePerUserProduct1786028000000 implements MigrationInterface {
  name = 'ProductReviewsOnePerUserProduct1786028000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH ranked AS (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY user_id, product_id
            ORDER BY
              CASE status
                WHEN 'approved' THEN 0
                WHEN 'pending' THEN 1
                ELSE 2
              END,
              updated_at DESC NULLS LAST,
              created_at DESC
          ) AS rn
        FROM product_reviews
        WHERE user_id IS NOT NULL
          AND deleted_at IS NULL
      )
      UPDATE product_reviews AS pr
      SET deleted_at = NOW(),
          updated_at = NOW()
      FROM ranked
      WHERE pr.id = ranked.id
        AND ranked.rn > 1
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_product_reviews_user_variant_active"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_product_reviews_user_product_active"
      ON "product_reviews" ("user_id", "product_id")
      WHERE "user_id" IS NOT NULL AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_product_reviews_user_product_active"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_product_reviews_user_variant_active"
      ON "product_reviews" ("user_id", "variant_id")
      WHERE "user_id" IS NOT NULL AND "variant_id" IS NOT NULL AND "deleted_at" IS NULL
    `);
  }
}
