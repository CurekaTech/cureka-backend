import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-status timestamps on orders + lightweight backfill from placed_at / shipment_events.
 */
export class AddOrderStatusTimestamps1785968000000 implements MigrationInterface {
  name = 'AddOrderStatusTimestamps1785968000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD COLUMN IF NOT EXISTS "confirmed_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "processing_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "shipped_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "out_for_delivery_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "failed_delivery_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "rto_at" TIMESTAMPTZ
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_orders_confirmed_at" ON "orders" ("confirmed_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_orders_shipped_at" ON "orders" ("shipped_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_orders_out_for_delivery_at" ON "orders" ("out_for_delivery_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_orders_delivered_at" ON "orders" ("delivered_at")`);

    // Early statuses from placed_at / created_at when already past that point
    await queryRunner.query(`
      UPDATE "orders"
      SET
        "confirmed_at" = COALESCE("placed_at", "created_at")
      WHERE "order_status" IN (
        'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY',
        'DELIVERED', 'FAILED_DELIVERY', 'RTO', 'CANCELLED'
      )
      AND "confirmed_at" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "orders"
      SET
        "processing_at" = COALESCE("placed_at", "created_at")
      WHERE "order_status" IN (
        'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY',
        'DELIVERED', 'FAILED_DELIVERY', 'RTO'
      )
      AND "processing_at" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "orders"
      SET "cancelled_at" = COALESCE("updated_at", "created_at")
      WHERE "order_status" = 'CANCELLED'
        AND "cancelled_at" IS NULL
    `);

    // Later stages from earliest matching shipment_events.happened_at
    await queryRunner.query(`
      UPDATE "orders" o
      SET "shipped_at" = src.happened_at
      FROM (
        SELECT s.order_id, MIN(se.happened_at) AS happened_at
        FROM shipments s
        INNER JOIN shipment_events se ON se.shipment_id = s.id AND se.deleted_at IS NULL
        WHERE se.happened_at IS NOT NULL
          AND (
            LOWER(se.status) IN ('pkp', 'rpkp', 'int', 'picked up', 'in transit', 'pickup complete', 'shipment picked up')
            OR LOWER(se.status) LIKE '%picked up%'
            OR LOWER(se.status) LIKE '%in transit%'
            OR LOWER(se.description) LIKE '%picked up%'
            OR LOWER(se.description) LIKE '%in transit%'
          )
        GROUP BY s.order_id
      ) src
      WHERE o.id = src.order_id
        AND o.shipped_at IS NULL
        AND o.order_status IN (
          'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY', 'RTO'
        )
    `);

    await queryRunner.query(`
      UPDATE "orders" o
      SET "out_for_delivery_at" = src.happened_at
      FROM (
        SELECT s.order_id, MIN(se.happened_at) AS happened_at
        FROM shipments s
        INNER JOIN shipment_events se ON se.shipment_id = s.id AND se.deleted_at IS NULL
        WHERE se.happened_at IS NOT NULL
          AND (
            LOWER(se.status) IN ('ood', 'ofd', 'rad', 'out for delivery')
            OR LOWER(se.status) LIKE '%out for delivery%'
            OR LOWER(se.description) LIKE '%out for delivery%'
          )
        GROUP BY s.order_id
      ) src
      WHERE o.id = src.order_id
        AND o.out_for_delivery_at IS NULL
        AND o.order_status IN (
          'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY', 'RTO'
        )
    `);

    await queryRunner.query(`
      UPDATE "orders" o
      SET "delivered_at" = src.happened_at
      FROM (
        SELECT s.order_id, MIN(se.happened_at) AS happened_at
        FROM shipments s
        INNER JOIN shipment_events se ON se.shipment_id = s.id AND se.deleted_at IS NULL
        WHERE se.happened_at IS NOT NULL
          AND (
            LOWER(se.status) IN ('del', 'delivered')
            OR LOWER(se.status) LIKE '%delivered%'
            OR LOWER(se.description) LIKE '%delivered%'
          )
        GROUP BY s.order_id
      ) src
      WHERE o.id = src.order_id
        AND o.delivered_at IS NULL
        AND o.order_status = 'DELIVERED'
    `);

    await queryRunner.query(`
      UPDATE "orders" o
      SET "failed_delivery_at" = src.happened_at
      FROM (
        SELECT s.order_id, MIN(se.happened_at) AS happened_at
        FROM shipments s
        INNER JOIN shipment_events se ON se.shipment_id = s.id AND se.deleted_at IS NULL
        WHERE se.happened_at IS NOT NULL
          AND (
            LOWER(se.status) IN ('und', 'dex', 'cna', 'ndr', 'failed delivery', 'undelivered')
            OR LOWER(se.status) LIKE '%undelivered%'
            OR LOWER(se.status) LIKE '%failed%'
          )
        GROUP BY s.order_id
      ) src
      WHERE o.id = src.order_id
        AND o.failed_delivery_at IS NULL
        AND o.order_status = 'FAILED_DELIVERY'
    `);

    await queryRunner.query(`
      UPDATE "orders" o
      SET "rto_at" = src.happened_at
      FROM (
        SELECT s.order_id, MIN(se.happened_at) AS happened_at
        FROM shipments s
        INNER JOIN shipment_events se ON se.shipment_id = s.id AND se.deleted_at IS NULL
        WHERE se.happened_at IS NOT NULL
          AND (
            LOWER(se.status) IN ('rto', 'rtd', 'rdel', 'rint')
            OR LOWER(se.status) LIKE '%rto%'
            OR LOWER(se.description) LIKE '%rto%'
          )
        GROUP BY s.order_id
      ) src
      WHERE o.id = src.order_id
        AND o.rto_at IS NULL
        AND o.order_status = 'RTO'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_delivered_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_out_for_delivery_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_shipped_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_confirmed_at"`);
    await queryRunner.query(`
      ALTER TABLE "orders"
        DROP COLUMN IF EXISTS "rto_at",
        DROP COLUMN IF EXISTS "failed_delivery_at",
        DROP COLUMN IF EXISTS "cancelled_at",
        DROP COLUMN IF EXISTS "delivered_at",
        DROP COLUMN IF EXISTS "out_for_delivery_at",
        DROP COLUMN IF EXISTS "shipped_at",
        DROP COLUMN IF EXISTS "processing_at",
        DROP COLUMN IF EXISTS "confirmed_at"
    `);
  }
}
