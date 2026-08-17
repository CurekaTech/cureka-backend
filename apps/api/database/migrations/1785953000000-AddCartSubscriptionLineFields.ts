import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cart-first product subscriptions: persist subscribe intent on cart → payment request → order lines.
 * Reuses existing product_subscription_frequency_enum.
 */
export class AddCartSubscriptionLineFields1785953000000 implements MigrationInterface {
  name = 'AddCartSubscriptionLineFields1785953000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cart_items"
      ADD COLUMN IF NOT EXISTS "is_subscription" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "cart_items"
      ADD COLUMN IF NOT EXISTS "frequency" "public"."product_subscription_frequency_enum"
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_request_items"
      ADD COLUMN IF NOT EXISTS "is_subscription" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_request_items"
      ADD COLUMN IF NOT EXISTS "frequency" "public"."product_subscription_frequency_enum"
    `);

    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD COLUMN IF NOT EXISTS "is_subscription" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD COLUMN IF NOT EXISTS "frequency" "public"."product_subscription_frequency_enum"
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD COLUMN IF NOT EXISTS "subscription_id" uuid
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_order_items_subscription_id"
      ON "order_items" ("subscription_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items"
      DROP CONSTRAINT IF EXISTS "FK_order_items_subscription_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD CONSTRAINT "FK_order_items_subscription_id"
      FOREIGN KEY ("subscription_id")
      REFERENCES "user_product_subscriptions"("id")
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "FK_order_items_subscription_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_items_subscription_id"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN IF EXISTS "subscription_id"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN IF EXISTS "frequency"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN IF EXISTS "is_subscription"`);
    await queryRunner.query(
      `ALTER TABLE "payment_request_items" DROP COLUMN IF EXISTS "frequency"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_request_items" DROP COLUMN IF EXISTS "is_subscription"`,
    );
    await queryRunner.query(`ALTER TABLE "cart_items" DROP COLUMN IF EXISTS "frequency"`);
    await queryRunner.query(`ALTER TABLE "cart_items" DROP COLUMN IF EXISTS "is_subscription"`);
  }
}
