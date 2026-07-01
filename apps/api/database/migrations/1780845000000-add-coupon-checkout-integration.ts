import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCouponCheckoutIntegration1780845000000 implements MigrationInterface {
  name = 'AddCouponCheckoutIntegration1780845000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "carts"
      ADD COLUMN "coupon_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "carts"
      ADD CONSTRAINT "FK_carts_coupon_id"
      FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id")
      ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_carts_coupon_id" ON "carts" ("coupon_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "coupon_usages" (
        "id"               uuid           NOT NULL DEFAULT uuid_generate_v4(),
        "coupon_id"        uuid           NOT NULL,
        "user_id"          uuid           NOT NULL,
        "order_id"         uuid           NOT NULL,
        "discount_amount"  numeric(12,2)  NOT NULL,
        "used_at"          TIMESTAMPTZ    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_coupon_usages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_coupon_usages_coupon_id" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_coupon_usages_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_coupon_usages_order_id" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coupon_usages_coupon_id" ON "coupon_usages" ("coupon_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coupon_usages_user_id" ON "coupon_usages" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coupon_usages_order_id" ON "coupon_usages" ("order_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coupon_usages_coupon_user"
      ON "coupon_usages" ("coupon_id", "user_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "coupon_id" uuid,
      ADD COLUMN "coupon_code" character varying(100),
      ADD COLUMN "coupon_title" character varying(255),
      ADD COLUMN "coupon_discount_type" character varying(20),
      ADD COLUMN "handling_amount" numeric(12,2) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD CONSTRAINT "FK_orders_coupon_id"
      FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id")
      ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_orders_coupon_id" ON "orders" ("coupon_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_coupon_id"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "FK_orders_coupon_id"`);
    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN IF EXISTS "handling_amount",
      DROP COLUMN IF EXISTS "coupon_discount_type",
      DROP COLUMN IF EXISTS "coupon_title",
      DROP COLUMN IF EXISTS "coupon_code",
      DROP COLUMN IF EXISTS "coupon_id"
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_coupon_usages_coupon_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_coupon_usages_order_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_coupon_usages_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_coupon_usages_coupon_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coupon_usages"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_carts_coupon_id"`);
    await queryRunner.query(`ALTER TABLE "carts" DROP CONSTRAINT IF EXISTS "FK_carts_coupon_id"`);
    await queryRunner.query(`ALTER TABLE "carts" DROP COLUMN IF EXISTS "coupon_id"`);
  }
}
