import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Links a refund back to the return that raised it.
 *
 * The partial unique index is the idempotency guard: a return can never spawn a
 * second refund, and cancellation refunds (which leave this null) are unaffected.
 */
export class LinkRefundRequestsToReturns1785980900000 implements MigrationInterface {
  name = 'LinkRefundRequestsToReturns1785980900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."refund_requests_reason_enum" ADD VALUE IF NOT EXISTS 'PRODUCT_RETURN'
    `);

    await queryRunner.query(`
      ALTER TABLE "refund_requests"
        ADD COLUMN IF NOT EXISTS "return_request_id" uuid
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_refund_requests_return_request_id"
      ON "refund_requests" ("return_request_id")
      WHERE "return_request_id" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "refund_requests"
        ADD CONSTRAINT "FK_refund_requests_return_request_id"
        FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "return_requests"
        ADD CONSTRAINT "FK_return_requests_refund_request_id"
        FOREIGN KEY ("refund_request_id") REFERENCES "refund_requests"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "return_requests"
        ADD CONSTRAINT "FK_return_requests_replacement_order_id"
        FOREIGN KEY ("replacement_order_id") REFERENCES "orders"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "return_requests"
        DROP CONSTRAINT IF EXISTS "FK_return_requests_replacement_order_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "return_requests"
        DROP CONSTRAINT IF EXISTS "FK_return_requests_refund_request_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "refund_requests"
        DROP CONSTRAINT IF EXISTS "FK_refund_requests_return_request_id"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_refund_requests_return_request_id"`);
    await queryRunner.query(`
      ALTER TABLE "refund_requests" DROP COLUMN IF EXISTS "return_request_id"
    `);
    // Postgres cannot drop a single enum value; 'PRODUCT_RETURN' is left in place.
  }
}
