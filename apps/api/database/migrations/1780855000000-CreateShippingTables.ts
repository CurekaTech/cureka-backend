import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateShippingTables1780855000000 implements MigrationInterface {
  name = 'CreateShippingTables1780855000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Extend orders_order_status_enum with new shipping lifecycle values ────
    // PostgreSQL requires ALTER TYPE to be outside a transaction when adding new values,
    // but TypeORM's migrationsTransactionMode='each' handles this correctly.
    await queryRunner.query(`ALTER TYPE "public"."orders_order_status_enum" ADD VALUE IF NOT EXISTS 'OUT_FOR_DELIVERY'`);
    await queryRunner.query(`ALTER TYPE "public"."orders_order_status_enum" ADD VALUE IF NOT EXISTS 'FAILED_DELIVERY'`);
    await queryRunner.query(`ALTER TYPE "public"."orders_order_status_enum" ADD VALUE IF NOT EXISTS 'RTO'`);

    // ── 2. Create shipments_shipment_status_enum ─────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "public"."shipments_shipment_status_enum"
      AS ENUM (
        'PENDING',
        'CONFIRMED',
        'PROCESSING',
        'PICKUP_PENDING',
        'PICKUP_COMPLETE',
        'IN_TRANSIT',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'CANCELLED',
        'FAILED_DELIVERY',
        'RTO_INITIATED',
        'RTO',
        'NDR',
        'UNKNOWN'
      )
    `);

    // ── 3. Create shipments table ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "shipments" (
        "id"                      uuid                  NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"                  character varying(11) NOT NULL,
        "order_id"                uuid                  NOT NULL,
        "order_number"            character varying(30) NOT NULL,
        "shipway_order_id"        character varying(100) NOT NULL,
        "shipment_id"             character varying(100),
        "awb_number"              character varying(100),
        "courier_name"            character varying(255),
        "courier_id"              character varying(50),
        "tracking_url"            text,
        "label_url"               text,
        "invoice_url"             text,
        "pickup_id"               character varying(100),
        "warehouse_id"            character varying(50),
        "return_warehouse_id"     character varying(50),
        "shipment_status"         "public"."shipments_shipment_status_enum" NOT NULL DEFAULT 'PENDING',
        "shipway_raw_status"      character varying(100),
        "pushed_at"               timestamptz,
        "last_synced_at"          timestamptz,
        "last_webhook_event_id"   character varying(255),
        "created_by"              character varying(255),
        "updated_by"              character varying(255),
        "created_at"              timestamptz           NOT NULL DEFAULT now(),
        "updated_at"              timestamptz           NOT NULL DEFAULT now(),
        "deleted_at"              timestamptz,
        CONSTRAINT "PK_shipments"              PRIMARY KEY ("id"),
        CONSTRAINT "UQ_shipments_ref_id"       UNIQUE ("ref_id"),
        CONSTRAINT "UQ_shipments_shipway_order_id" UNIQUE ("shipway_order_id"),
        CONSTRAINT "FK_shipments_order_id"     FOREIGN KEY ("order_id")
          REFERENCES "orders"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_shipments_order_id"       ON "shipments" ("order_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_shipments_order_number"   ON "shipments" ("order_number")`);
    await queryRunner.query(`CREATE INDEX "IDX_shipments_awb_number"     ON "shipments" ("awb_number")`);
    await queryRunner.query(`CREATE INDEX "IDX_shipments_shipment_id"    ON "shipments" ("shipment_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_shipments_status"         ON "shipments" ("shipment_status")`);

    // ── 4. Create shipment_events table ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "shipment_events" (
        "id"           uuid                  NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"       character varying(11) NOT NULL,
        "shipment_id"  uuid                  NOT NULL,
        "status"       character varying(100) NOT NULL,
        "description"  text,
        "location"     character varying(255),
        "happened_at"  timestamptz,
        "source"       character varying(20)  NOT NULL DEFAULT 'webhook',
        "created_by"   character varying(255),
        "updated_by"   character varying(255),
        "created_at"   timestamptz           NOT NULL DEFAULT now(),
        "updated_at"   timestamptz           NOT NULL DEFAULT now(),
        "deleted_at"   timestamptz,
        CONSTRAINT "PK_shipment_events"        PRIMARY KEY ("id"),
        CONSTRAINT "UQ_shipment_events_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_shipment_events_shipment_id" FOREIGN KEY ("shipment_id")
          REFERENCES "shipments"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_shipment_events_shipment_id" ON "shipment_events" ("shipment_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_shipment_events_happened_at" ON "shipment_events" ("happened_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_shipment_events_happened_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_shipment_events_shipment_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shipment_events"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_shipments_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_shipments_shipment_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_shipments_awb_number"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_shipments_order_number"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_shipments_order_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shipments"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."shipments_shipment_status_enum"`);

    // Note: PostgreSQL does not support removing values from an enum type.
    // The OUT_FOR_DELIVERY, FAILED_DELIVERY, RTO values added to orders_order_status_enum
    // cannot be automatically removed. Manual intervention is required if rolling back.
  }
}
