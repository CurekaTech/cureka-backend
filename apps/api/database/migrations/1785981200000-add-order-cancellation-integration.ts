import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderCancellationIntegration1785981200000 implements MigrationInterface {
  name = 'AddOrderCancellationIntegration1785981200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD COLUMN IF NOT EXISTS "cancellation_status" character varying(40) NOT NULL DEFAULT 'NONE',
        ADD COLUMN IF NOT EXISTS "cancellation_unicommerce_status" character varying(40) NOT NULL DEFAULT 'NOT_STARTED',
        ADD COLUMN IF NOT EXISTS "cancellation_shipway_status" character varying(40) NOT NULL DEFAULT 'NOT_STARTED',
        ADD COLUMN IF NOT EXISTS "cancellation_sync_error" text,
        ADD COLUMN IF NOT EXISTS "cancellation_attempt_count" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "cancellation_last_attempt_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "cancellation_requested_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "cancellation_requested_by" character varying(255),
        ADD COLUMN IF NOT EXISTS "cancellation_requested_by_type" character varying(20)
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_orders_cancellation_status" ON "orders" ("cancellation_status")`,
    );

    await queryRunner.query(`
      UPDATE "orders"
      SET
        "cancellation_status" = 'HISTORICAL_UNVERIFIED',
        "cancellation_unicommerce_status" = 'UNCERTAIN',
        "cancellation_shipway_status" = 'UNCERTAIN',
        "cancellation_sync_error" = 'Historical local cancellation — Unicommerce/Shipway outcome was never recorded. Do not treat as confirmed external cancel.'
      WHERE "order_status" = 'CANCELLED'
        AND "cancellation_status" = 'NONE'
        AND "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "order_fulfillment_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        "order_id" uuid NOT NULL,
        "request_type" character varying(30) NOT NULL,
        "event_type" character varying(80) NOT NULL,
        "from_status" character varying(60),
        "to_status" character varying(60),
        "actor_id" character varying(255) NOT NULL,
        "actor_type" character varying(30) NOT NULL,
        "message" text,
        "metadata" jsonb,
        "is_customer_visible" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_order_fulfillment_events" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_order_fulfillment_events_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_order_fulfillment_events_order_id" FOREIGN KEY ("order_id")
          REFERENCES "orders"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_order_fulfillment_events_order_id" ON "order_fulfillment_events" ("order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_order_fulfillment_events_request_type" ON "order_fulfillment_events" ("request_type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_order_fulfillment_events_event_type" ON "order_fulfillment_events" ("event_type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_order_fulfillment_events_created_at" ON "order_fulfillment_events" ("created_at")`,
    );

    await queryRunner.query(`
      ALTER TABLE "return_pickups"
        ADD COLUMN IF NOT EXISTS "unicommerce_reverse_pickup_code" character varying(100),
        ADD COLUMN IF NOT EXISTS "shipway_order_id" character varying(100),
        ADD COLUMN IF NOT EXISTS "unicommerce_sync_status" character varying(40),
        ADD COLUMN IF NOT EXISTS "shipway_booking_status" character varying(40)
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_return_pickups_unicommerce_reverse_pickup_code"
       ON "return_pickups" ("unicommerce_reverse_pickup_code")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_return_pickups_shipway_order_id"
       ON "return_pickups" ("shipway_order_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_return_pickups_shipway_order_id"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_return_pickups_unicommerce_reverse_pickup_code"`,
    );
    await queryRunner.query(`
      ALTER TABLE "return_pickups"
        DROP COLUMN IF EXISTS "shipway_booking_status",
        DROP COLUMN IF EXISTS "unicommerce_sync_status",
        DROP COLUMN IF EXISTS "shipway_order_id",
        DROP COLUMN IF EXISTS "unicommerce_reverse_pickup_code"
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "order_fulfillment_events"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_cancellation_status"`);
    await queryRunner.query(`
      ALTER TABLE "orders"
        DROP COLUMN IF EXISTS "cancellation_requested_by_type",
        DROP COLUMN IF EXISTS "cancellation_requested_by",
        DROP COLUMN IF EXISTS "cancellation_requested_at",
        DROP COLUMN IF EXISTS "cancellation_last_attempt_at",
        DROP COLUMN IF EXISTS "cancellation_attempt_count",
        DROP COLUMN IF EXISTS "cancellation_sync_error",
        DROP COLUMN IF EXISTS "cancellation_shipway_status",
        DROP COLUMN IF EXISTS "cancellation_unicommerce_status",
        DROP COLUMN IF EXISTS "cancellation_status"
    `);
  }
}
