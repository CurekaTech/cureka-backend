import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompleteGokwikPersistence1780914000000 implements MigrationInterface {
  name = 'CompleteGokwikPersistence1780914000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."orders_payment_method_enum" ADD VALUE IF NOT EXISTS 'GOKWIK_PREPAID'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."orders_payment_method_enum" ADD VALUE IF NOT EXISTS 'GOKWIK_PARTIAL_COD'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."orders_payment_status_enum" ADD VALUE IF NOT EXISTS 'PARTIALLY_PAID'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."orders_payment_status_enum" ADD VALUE IF NOT EXISTS 'REFUND_PENDING'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."orders_payment_status_enum" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."orders_order_source_enum" ADD VALUE IF NOT EXISTS 'GoKwik'`,
    );

    await queryRunner.query(`
      INSERT INTO "admin_setting" ("ref_id", "key", "value", "status", "description", "created_by")
      VALUES (
        'GKS202607170001',
        'gokwik_shipping_slabs',
        '[{"min":0,"max":199.99,"charge":75},{"min":200,"max":399.99,"charge":55},{"min":400,"max":599.99,"charge":45},{"min":600,"max":899.99,"charge":25},{"min":900,"max":null,"charge":0}]',
        'active',
        'Authoritative Cureka shipping slabs mirrored in GoKwik Dashboard for hybrid validation.',
        'system'
      )
      ON CONFLICT ("key") DO NOTHING
    `);

    await queryRunner.query(`
      CREATE TABLE "gokwik_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" varchar(16) NOT NULL,
        "order_id" uuid NOT NULL,
        "cart_id" uuid NOT NULL,
        "gokwik_order_id" varchar(100),
        "payment_id" varchar(200),
        "gateway_transaction_id" varchar(200),
        "payment_method" varchar(40) NOT NULL,
        "payment_amount" decimal(12,2) NOT NULL,
        "prepaid_amount" decimal(12,2) NOT NULL DEFAULT 0,
        "payable_on_delivery" decimal(12,2) NOT NULL DEFAULT 0,
        "customer_phone" varchar(10) NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_by" varchar(255),
        "updated_by" varchar(255),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_gokwik_orders" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_gokwik_orders_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_gokwik_orders_order_id" UNIQUE ("order_id"),
        CONSTRAINT "UQ_gokwik_orders_cart_id" UNIQUE ("cart_id"),
        CONSTRAINT "UQ_gokwik_orders_gokwik_order_id" UNIQUE ("gokwik_order_id"),
        CONSTRAINT "UQ_gokwik_orders_payment_id" UNIQUE ("payment_id"),
        CONSTRAINT "FK_gokwik_orders_order_id" FOREIGN KEY ("order_id")
          REFERENCES "orders"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "gokwik_webhook_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" varchar(16) NOT NULL,
        "event_key" varchar(500) NOT NULL,
        "entity" varchar(40) NOT NULL,
        "event" varchar(80) NOT NULL,
        "provider_reference_id" varchar(200),
        "status" varchar(20) NOT NULL DEFAULT 'received',
        "payload" jsonb NOT NULL,
        "processed_at" timestamptz,
        "last_error" text,
        "created_by" varchar(255),
        "updated_by" varchar(255),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_gokwik_webhook_events" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_gokwik_webhook_events_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_gokwik_webhook_events_event_key" UNIQUE ("event_key")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_gokwik_webhook_events_entity" ON "gokwik_webhook_events" ("entity")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_gokwik_webhook_events_event" ON "gokwik_webhook_events" ("event")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_gokwik_webhook_events_status" ON "gokwik_webhook_events" ("status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "gokwik_refunds" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" varchar(16) NOT NULL,
        "order_id" uuid NOT NULL,
        "refund_id" varchar(200) NOT NULL,
        "payment_id" varchar(200) NOT NULL,
        "transaction_payment_id" varchar(200),
        "amount" decimal(12,2) NOT NULL,
        "status" varchar(30) NOT NULL,
        "auto" boolean NOT NULL DEFAULT false,
        "description" text,
        "created_by" varchar(255),
        "updated_by" varchar(255),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_gokwik_refunds" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_gokwik_refunds_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_gokwik_refunds_refund_id" UNIQUE ("refund_id"),
        CONSTRAINT "FK_gokwik_refunds_order_id" FOREIGN KEY ("order_id")
          REFERENCES "orders"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_gokwik_refunds_order_id" ON "gokwik_refunds" ("order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_gokwik_refunds_status" ON "gokwik_refunds" ("status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "gokwik_abandoned_carts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" varchar(16) NOT NULL,
        "external_cart_id" varchar(200) NOT NULL,
        "merchant_cart_id" varchar(200),
        "request_id" varchar(200),
        "payload" jsonb NOT NULL,
        "received_at" timestamptz NOT NULL,
        "created_by" varchar(255),
        "updated_by" varchar(255),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_gokwik_abandoned_carts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_gokwik_abandoned_carts_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_gokwik_abandoned_carts_external_cart_id" UNIQUE ("external_cart_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_gokwik_abandoned_carts_merchant_cart_id" ON "gokwik_abandoned_carts" ("merchant_cart_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "gokwik_sync_states" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" varchar(16) NOT NULL,
        "resource_type" varchar(20) NOT NULL,
        "resource_id" uuid NOT NULL,
        "remote_id" varchar(200),
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "attempts" integer NOT NULL DEFAULT 0,
        "last_error" text,
        "synced_at" timestamptz,
        "created_by" varchar(255),
        "updated_by" varchar(255),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_gokwik_sync_states" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_gokwik_sync_states_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_gokwik_sync_resource" UNIQUE ("resource_type", "resource_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_gokwik_sync_states_status" ON "gokwik_sync_states" ("status")`,
    );

    await queryRunner.query(
      `ALTER TABLE "shipments" ADD COLUMN "group_key" varchar(100) NOT NULL DEFAULT 'default'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_shipments_order_group" ON "shipments" ("order_id", "group_key")`,
    );
    await queryRunner.query(`
      CREATE TABLE "shipment_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "shipment_id" uuid NOT NULL,
        "order_item_id" uuid NOT NULL,
        "quantity" integer NOT NULL CHECK ("quantity" > 0),
        CONSTRAINT "PK_shipment_items" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_shipment_items_shipment_order_item" UNIQUE ("shipment_id", "order_item_id"),
        CONSTRAINT "FK_shipment_items_shipment_id" FOREIGN KEY ("shipment_id")
          REFERENCES "shipments"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_shipment_items_order_item_id" FOREIGN KEY ("order_item_id")
          REFERENCES "order_items"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_shipment_items_shipment_id" ON "shipment_items" ("shipment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_shipment_items_order_item_id" ON "shipment_items" ("order_item_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "shipment_items"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_shipments_order_group"`);
    await queryRunner.query(`ALTER TABLE "shipments" DROP COLUMN IF EXISTS "group_key"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gokwik_sync_states"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gokwik_abandoned_carts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gokwik_refunds"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gokwik_webhook_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gokwik_orders"`);
    await queryRunner.query(`DELETE FROM "admin_setting" WHERE "key" = 'gokwik_shipping_slabs'`);
    // PostgreSQL enum values are intentionally retained because removing values
    // requires rebuilding every dependent enum column and is unsafe on rollback.
  }
}
