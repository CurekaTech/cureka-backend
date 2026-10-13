import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stores bundle identity and placement COD on order lines, and the frozen
 * replacement price difference on a return. Does not backfill COD or overwrite
 * an existing bundle snapshot.
 */
export class AddReturnReplaceBundleSnapshot1785998000000 implements MigrationInterface {
  name = 'AddReturnReplaceBundleSnapshot1785998000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."refund_requests_reason_enum"
      ADD VALUE IF NOT EXISTS 'REPLACEMENT_PRICE_DIFFERENCE'
    `);

    await queryRunner.query(`
      ALTER TABLE "order_items"
        ADD COLUMN IF NOT EXISTS "bundle_components" jsonb,
        ADD COLUMN IF NOT EXISTS "cod_available" boolean
    `);

    await queryRunner.query(`
      ALTER TABLE "return_request_items"
        ADD COLUMN IF NOT EXISTS "affected_component_variant_id" uuid,
        ADD COLUMN IF NOT EXISTS "affected_component_sku" varchar(100),
        ADD COLUMN IF NOT EXISTS "affected_component_name" varchar(500)
    `);

    await queryRunner.query(`
      ALTER TABLE "return_requests"
        ADD COLUMN IF NOT EXISTS "replacement_original_amount" numeric(12,2),
        ADD COLUMN IF NOT EXISTS "replacement_quote_amount" numeric(12,2),
        ADD COLUMN IF NOT EXISTS "replacement_difference_amount" numeric(12,2),
        ADD COLUMN IF NOT EXISTS "replacement_settlement" varchar(20),
        ADD COLUMN IF NOT EXISTS "replacement_payment_request_id" uuid,
        ADD COLUMN IF NOT EXISTS "replacement_payment_link" varchar(500)
    `);

    await queryRunner.query(`
      ALTER TABLE "return_requests"
        ADD CONSTRAINT "FK_return_requests_replacement_payment_request_id"
        FOREIGN KEY ("replacement_payment_request_id")
        REFERENCES "payment_requests"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "return_requests"
        DROP CONSTRAINT IF EXISTS "FK_return_requests_replacement_payment_request_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "return_requests"
        DROP COLUMN IF EXISTS "replacement_payment_link",
        DROP COLUMN IF EXISTS "replacement_payment_request_id",
        DROP COLUMN IF EXISTS "replacement_settlement",
        DROP COLUMN IF EXISTS "replacement_difference_amount",
        DROP COLUMN IF EXISTS "replacement_quote_amount",
        DROP COLUMN IF EXISTS "replacement_original_amount"
    `);
    await queryRunner.query(`
      ALTER TABLE "return_request_items"
        DROP COLUMN IF EXISTS "affected_component_name",
        DROP COLUMN IF EXISTS "affected_component_sku",
        DROP COLUMN IF EXISTS "affected_component_variant_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items"
        DROP COLUMN IF EXISTS "cod_available",
        DROP COLUMN IF EXISTS "bundle_components"
    `);
  }
}
