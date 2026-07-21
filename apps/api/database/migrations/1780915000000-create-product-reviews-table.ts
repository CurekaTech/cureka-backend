import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductReviewsTable1780915000000 implements MigrationInterface {
  name = 'CreateProductReviewsTable1780915000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."product_reviews_status_enum" AS ENUM('pending', 'approved', 'rejected')
    `);

    await queryRunner.query(`
      CREATE TABLE "product_reviews" (
        "id"             uuid                                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"         character varying(16)                             NOT NULL,
        "product_id"     uuid                                              NOT NULL,
        "product_ref_id" character varying(16)                             NOT NULL,
        "user_id"        uuid                                              NOT NULL,
        "customer_name"  character varying(200)                            NOT NULL,
        "rating"         smallint                                          NOT NULL,
        "review"         text                                              NOT NULL,
        "status"         "public"."product_reviews_status_enum"            NOT NULL DEFAULT 'pending',
        "moderated_by"   character varying(255),
        "moderated_at"   TIMESTAMPTZ,
        "created_by"     character varying(255),
        "updated_by"     character varying(255),
        "created_at"     TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "deleted_at"     TIMESTAMPTZ,
        CONSTRAINT "PK_product_reviews" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_product_reviews_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_product_reviews_product_id" FOREIGN KEY ("product_id")
          REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_product_reviews_product_id" ON "product_reviews" ("product_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_reviews_product_ref_id" ON "product_reviews" ("product_ref_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_reviews_user_id" ON "product_reviews" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_reviews_status" ON "product_reviews" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_reviews_product_status" ON "product_reviews" ("product_id", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_reviews_product_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_reviews_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_reviews_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_reviews_product_ref_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_reviews_product_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_reviews"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."product_reviews_status_enum"`);
  }
}
