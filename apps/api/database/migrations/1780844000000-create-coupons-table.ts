import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCouponsTable1780844000000 implements MigrationInterface {
  name = 'CreateCouponsTable1780844000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."coupons_discount_type_enum" AS ENUM ('fixed', 'percentage')
    `);

    await queryRunner.query(`
      CREATE TABLE "coupons" (
        "id"               uuid                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"           character varying(11)             NOT NULL,
        "coupon_type"      character varying(100)            NOT NULL,
        "title"            character varying(255)            NOT NULL,
        "code"             character varying(100)            NOT NULL,
        "same_user_limit"  integer,
        "discount_type"    "public"."coupons_discount_type_enum" NOT NULL,
        "discount_amount"  numeric(12,2)                     NOT NULL,
        "min_purchase"     numeric(12,2)                     NOT NULL DEFAULT 0,
        "start_date"       TIMESTAMPTZ                       NOT NULL,
        "expiry_date"      TIMESTAMPTZ                       NOT NULL,
        "status"           "public"."brands_status_enum"     NOT NULL DEFAULT 'active',
        "created_by"       character varying(255),
        "updated_by"       character varying(255),
        "created_at"       TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMPTZ,
        CONSTRAINT "PK_coupons"       PRIMARY KEY ("id"),
        CONSTRAINT "UQ_coupons_ref_id" UNIQUE ("ref_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coupons_coupon_type" ON "coupons" ("coupon_type")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coupons_title" ON "coupons" ("title")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coupons_code" ON "coupons" ("code")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_coupons_code_active"
      ON "coupons" (UPPER("code"))
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coupons_discount_type" ON "coupons" ("discount_type")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coupons_status" ON "coupons" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_coupons_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_coupons_discount_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_coupons_code_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_coupons_code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_coupons_title"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_coupons_coupon_type"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coupons"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."coupons_discount_type_enum"`);
  }
}
