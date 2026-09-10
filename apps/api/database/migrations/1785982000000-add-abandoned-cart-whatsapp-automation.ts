import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Abandoned-cart WhatsApp automation:
 * - Dedicated cart activity timestamp (customer mutations only)
 * - Durable BOB /abancart outbox for 24h suppression + PM2-safe claims
 */
export class AddAbandonedCartWhatsappAutomation1785982000000 implements MigrationInterface {
  name = 'AddAbandonedCartWhatsappAutomation1785982000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "carts"
      ADD COLUMN IF NOT EXISTS "last_customer_activity_at" TIMESTAMPTZ NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_carts_active_customer_activity"
      ON "carts" ("is_active", "last_customer_activity_at")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bob_abandoned_cart_outbox" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "ref_id" varchar(16) NOT NULL,
        "user_id" uuid NOT NULL,
        "cart_id" uuid NOT NULL,
        "cart_ref_id" varchar(30) NOT NULL,
        "destination_phone_normalized" varchar(20) NOT NULL,
        "notification_kind" varchar(60) NOT NULL DEFAULT 'abandoned-cart',
        "idempotency_key" varchar(160) NOT NULL,
        "job_id" varchar(160) NULL,
        "status" varchar(40) NOT NULL DEFAULT 'pending',
        "attempts" integer NOT NULL DEFAULT 0,
        "last_http_status" integer NULL,
        "last_error" text NULL,
        "accepted_at" TIMESTAMPTZ NULL,
        "locked_at" TIMESTAMPTZ NULL,
        "claim_token" varchar(64) NULL,
        "payload_snapshot" jsonb NULL,
        "created_by" varchar(255) NULL,
        "updated_by" varchar(255) NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ NULL,
        CONSTRAINT "UQ_bob_abandoned_cart_outbox_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_bob_abandoned_cart_outbox_idempotency" UNIQUE ("idempotency_key")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bob_abandoned_cart_outbox_user_status_accepted"
      ON "bob_abandoned_cart_outbox" ("user_id", "status", "accepted_at")
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bob_abandoned_cart_outbox_phone_status_accepted"
      ON "bob_abandoned_cart_outbox" ("destination_phone_normalized", "status", "accepted_at")
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bob_abandoned_cart_outbox_cart_status"
      ON "bob_abandoned_cart_outbox" ("cart_id", "status")
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_bob_abandoned_cart_outbox_user_inflight"
      ON "bob_abandoned_cart_outbox" ("user_id")
      WHERE "deleted_at" IS NULL AND "status" IN ('pending', 'sending')
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_bob_abandoned_cart_outbox_phone_inflight"
      ON "bob_abandoned_cart_outbox" ("destination_phone_normalized")
      WHERE "deleted_at" IS NULL AND "status" IN ('pending', 'sending')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Leave outbox history in place so a revert cannot re-open 24h suppression
    // and duplicate WhatsApp. Drop only the cart activity helper index/column.
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_carts_active_customer_activity"`);
    await queryRunner.query(`
      ALTER TABLE "carts" DROP COLUMN IF EXISTS "last_customer_activity_at"
    `);
  }
}
