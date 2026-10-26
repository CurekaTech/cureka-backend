import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Abandoned-cart WhatsApp: stop replaying old carts.
 * - Session checkout_id + activity timestamp on the outbox
 * - Tokenized cart snapshots for restore links
 */
export class FixAbandonedCartSessionAndRecovery1786017200000 implements MigrationInterface {
  name = 'FixAbandonedCartSessionAndRecovery1786017200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bob_abandoned_cart_outbox"
        ADD COLUMN IF NOT EXISTS "checkout_id" varchar(80) NULL,
        ADD COLUMN IF NOT EXISTS "activity_at" TIMESTAMPTZ NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_bob_abandoned_cart_outbox_checkout_id"
      ON "bob_abandoned_cart_outbox" ("checkout_id")
      WHERE "deleted_at" IS NULL AND "checkout_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_bob_abandoned_cart_outbox_cart_activity"
      ON "bob_abandoned_cart_outbox" ("cart_id", "activity_at")
      WHERE "deleted_at" IS NULL AND "activity_at" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cart_recovery_snapshots" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "token" varchar(64) NOT NULL,
        "cart_id" uuid NOT NULL,
        "checkout_id" varchar(80) NOT NULL,
        "items" jsonb NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "restored_at" TIMESTAMPTZ NULL,
        "created_by" varchar(255) NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_cart_recovery_snapshots_token" UNIQUE ("token")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cart_recovery_snapshots_expires_at"
      ON "cart_recovery_snapshots" ("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cart_recovery_snapshots"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_bob_abandoned_cart_outbox_cart_activity"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_bob_abandoned_cart_outbox_checkout_id"`);
    await queryRunner.query(`
      ALTER TABLE "bob_abandoned_cart_outbox"
        DROP COLUMN IF EXISTS "activity_at",
        DROP COLUMN IF EXISTS "checkout_id"
    `);
  }
}
