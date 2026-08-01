import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Existing COD orders lived only in `orders`, so they never appeared on
 * GET /admin/payment-requests (admin order list). Mirror them as COD payment_requests.
 */
export class BackfillCodOrdersIntoPaymentRequests1780916200000 implements MigrationInterface {
  name = 'BackfillCodOrdersIntoPaymentRequests1780916200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "payment_requests" (
        "id",
        "ref_id",
        "customer_id",
        "address_id",
        "status",
        "subtotal",
        "discount",
        "tax",
        "shipping",
        "handling",
        "platform_fee",
        "cod_charge",
        "total_amount",
        "coupon_code",
        "coupon_discount",
        "currency",
        "notes",
        "order_source",
        "payment_provider",
        "payment_link",
        "provider_reference_id",
        "payment_reference",
        "expires_at",
        "paid_at",
        "created_at",
        "created_by",
        "updated_at",
        "updated_by"
      )
      SELECT
        gen_random_uuid(),
        'COD' || substr(replace(o.id::text, '-', ''), 1, 13),
        o.user_id,
        NULL,
        CASE
          WHEN o.order_status = 'CANCELLED' THEN 'CANCELLED'::payment_requests_status_enum
          WHEN o.payment_status = 'PAID' THEN 'PAID'::payment_requests_status_enum
          ELSE 'PAYMENT_PENDING'::payment_requests_status_enum
        END,
        o.subtotal,
        o.discount_amount,
        0,
        o.shipping_amount,
        o.handling_amount,
        o.platform_fee,
        o.cod_charge,
        o.grand_total,
        o.coupon_code,
        o.discount_amount,
        'INR',
        COALESCE(o.notes, 'COD order ' || o.order_number),
        o.order_source,
        'COD',
        NULL,
        o.order_number,
        o.order_number,
        NULL,
        CASE WHEN o.payment_status = 'PAID' THEN o.placed_at ELSE NULL END,
        o.created_at,
        o.created_by,
        o.updated_at,
        o.updated_by
      FROM "orders" o
      WHERE o.deleted_at IS NULL
        AND o.payment_method = 'COD'
        AND NOT EXISTS (
          SELECT 1
          FROM "payment_requests" pr
          WHERE pr.deleted_at IS NULL
            AND pr.payment_provider = 'COD'
            AND pr.payment_reference = o.order_number
        )
      ON CONFLICT ("ref_id") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "payment_request_items" (
        "id",
        "ref_id",
        "payment_request_id",
        "product_id",
        "variant_id",
        "quantity",
        "unit_price",
        "discount",
        "tax",
        "total",
        "created_at",
        "created_by",
        "updated_at",
        "updated_by"
      )
      SELECT
        gen_random_uuid(),
        'PI' || substr(replace(oi.id::text, '-', ''), 1, 14),
        pr.id,
        oi.product_id,
        oi.variant_id,
        oi.quantity,
        oi.unit_price,
        0,
        0,
        oi.total_price,
        oi.created_at,
        oi.created_by,
        oi.updated_at,
        oi.updated_by
      FROM "order_items" oi
      INNER JOIN "orders" o ON o.id = oi.order_id AND o.deleted_at IS NULL
      INNER JOIN "payment_requests" pr
        ON pr.payment_provider = 'COD'
       AND pr.payment_reference = o.order_number
       AND pr.deleted_at IS NULL
      WHERE oi.deleted_at IS NULL
        AND o.payment_method = 'COD'
        AND NOT EXISTS (
          SELECT 1
          FROM "payment_request_items" pri
          WHERE pri.deleted_at IS NULL
            AND pri.payment_request_id = pr.id
            AND pri.product_id = oi.product_id
            AND pri.variant_id = oi.variant_id
            AND pri.quantity = oi.quantity
        )
      ON CONFLICT ("ref_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "payment_request_items" pri
      USING "payment_requests" pr
      WHERE pri.payment_request_id = pr.id
        AND pr.payment_provider = 'COD'
        AND pr.provider_reference_id IS NOT NULL
        AND pr.payment_reference = pr.provider_reference_id
    `);

    await queryRunner.query(`
      DELETE FROM "payment_requests"
      WHERE payment_provider = 'COD'
        AND provider_reference_id IS NOT NULL
        AND payment_reference = provider_reference_id
    `);
  }
}
