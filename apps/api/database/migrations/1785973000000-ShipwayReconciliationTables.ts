import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Shipway reconciliation support:
 * - oms_order_id on shipments (Shipway/EzySlip internal id, distinct from merchant ORD…)
 * - unresolved webhook inbox for controlled retry
 * - durable BOB fulfillment notify outbox (PM2-safe idempotency)
 */
export class ShipwayReconciliationTables1785973000000 implements MigrationInterface {
  name = 'ShipwayReconciliationTables1785973000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shipments"
      ADD COLUMN IF NOT EXISTS "oms_order_id" varchar(100) NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shipments_oms_order_id"
      ON "shipments" ("oms_order_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shipments_awb_number"
      ON "shipments" ("awb_number")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "shipway_webhook_unresolved" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "ref_id" varchar(16) NOT NULL,
        "payload_order_id" varchar(100) NULL,
        "awb_number" varchar(100) NULL,
        "status" varchar(100) NULL,
        "payload_fingerprint" varchar(64) NOT NULL,
        "auth_mode" varchar(40) NOT NULL,
        "outcome" varchar(40) NOT NULL DEFAULT 'unresolved',
        "reason" varchar(255) NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "last_error" text NULL,
        "sanitized_payload" jsonb NULL,
        "resolved_shipment_id" uuid NULL,
        "resolved_order_id" uuid NULL,
        "created_by" varchar(255) NULL,
        "updated_by" varchar(255) NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ NULL,
        CONSTRAINT "UQ_shipway_webhook_unresolved_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_shipway_webhook_unresolved_fingerprint" UNIQUE ("payload_fingerprint")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shipway_webhook_unresolved_outcome"
      ON "shipway_webhook_unresolved" ("outcome")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_shipway_webhook_unresolved_awb"
      ON "shipway_webhook_unresolved" ("awb_number")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bob_notify_outbox" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "ref_id" varchar(16) NOT NULL,
        "order_id" uuid NOT NULL,
        "order_number" varchar(30) NOT NULL,
        "shipment_id" uuid NULL,
        "notification_kind" varchar(60) NOT NULL,
        "idempotency_key" varchar(160) NOT NULL,
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
        CONSTRAINT "UQ_bob_notify_outbox_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_bob_notify_outbox_idempotency" UNIQUE ("idempotency_key")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bob_notify_outbox_order_kind_status"
      ON "bob_notify_outbox" ("order_id", "notification_kind", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Do NOT drop bob_notify_outbox or shipway_webhook_unresolved on revert.
    // Those rows are durable notify/reconcile history; dropping them after a
    // recovery apply can allow duplicate customer messages. Prefer reverting
    // application code while leaving compatible tables and data in place.
    // oms_order_id is left as a nullable column for the same reason.
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_shipments_awb_number"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_shipments_oms_order_id"`);
  }
}
