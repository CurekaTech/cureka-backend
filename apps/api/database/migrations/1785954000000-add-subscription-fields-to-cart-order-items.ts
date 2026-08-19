import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Subscription checkout fields were added to TypeORM entities without a table migration.
 * Beta POST /cart/items fails with:
 *   column CartEntity__CartEntity_items.is_subscription does not exist
 */
export class AddSubscriptionFieldsToCartOrderItems1785954000000 implements MigrationInterface {
  name = 'AddSubscriptionFieldsToCartOrderItems1785954000000';

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
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_order_items_subscription_id'
        ) THEN
          ALTER TABLE "order_items"
          ADD CONSTRAINT "FK_order_items_subscription_id"
          FOREIGN KEY ("subscription_id") REFERENCES "user_product_subscriptions"("id")
          ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_order_items_subscription_id"
      ON "order_items" ("subscription_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_request_items"
      ADD COLUMN IF NOT EXISTS "is_subscription" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_request_items"
      ADD COLUMN IF NOT EXISTS "frequency" "public"."product_subscription_frequency_enum"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment_request_items" DROP COLUMN IF EXISTS "frequency"`);
    await queryRunner.query(
      `ALTER TABLE "payment_request_items" DROP COLUMN IF EXISTS "is_subscription"`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_items_subscription_id"`);
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "FK_order_items_subscription_id"`,
    );
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN IF EXISTS "subscription_id"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN IF EXISTS "frequency"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN IF EXISTS "is_subscription"`);

    await queryRunner.query(`ALTER TABLE "cart_items" DROP COLUMN IF EXISTS "frequency"`);
    await queryRunner.query(`ALTER TABLE "cart_items" DROP COLUMN IF EXISTS "is_subscription"`);
  }
}
