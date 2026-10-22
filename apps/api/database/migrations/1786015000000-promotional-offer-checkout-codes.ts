import { MigrationInterface, QueryRunner } from 'typeorm';

export class PromotionalOfferCheckoutCodes1786015000000 implements MigrationInterface {
  name = 'PromotionalOfferCheckoutCodes1786015000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "promotional_offers"
      ADD COLUMN IF NOT EXISTS "code" varchar(100)
    `);
    await queryRunner.query(`
      ALTER TABLE "promotional_offers"
      DROP COLUMN IF EXISTS "priority"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_promotional_offers_code_active"
      ON "promotional_offers" (UPPER("code"))
      WHERE "deleted_at" IS NULL AND "code" IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "carts"
      ADD COLUMN IF NOT EXISTS "promotional_offer_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "carts"
      ADD COLUMN IF NOT EXISTS "selected_code" varchar(100)
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "carts"
        ADD CONSTRAINT "FK_carts_promotional_offer"
        FOREIGN KEY ("promotional_offer_id") REFERENCES "promotional_offers"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_requests"
      ADD COLUMN IF NOT EXISTS "coupon_id" uuid
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "payment_requests"
        ADD CONSTRAINT "FK_payment_requests_coupon"
        FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment_requests" DROP CONSTRAINT IF EXISTS "FK_payment_requests_coupon"`);
    await queryRunner.query(`ALTER TABLE "payment_requests" DROP COLUMN IF EXISTS "coupon_id"`);
    await queryRunner.query(`ALTER TABLE "carts" DROP CONSTRAINT IF EXISTS "FK_carts_promotional_offer"`);
    await queryRunner.query(`ALTER TABLE "carts" DROP COLUMN IF EXISTS "selected_code"`);
    await queryRunner.query(`ALTER TABLE "carts" DROP COLUMN IF EXISTS "promotional_offer_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_promotional_offers_code_active"`);
    await queryRunner.query(`ALTER TABLE "promotional_offers" DROP COLUMN IF EXISTS "code"`);
    await queryRunner.query(`
      ALTER TABLE "promotional_offers"
      ADD COLUMN IF NOT EXISTS "priority" integer NOT NULL DEFAULT 100
    `);
  }
}
