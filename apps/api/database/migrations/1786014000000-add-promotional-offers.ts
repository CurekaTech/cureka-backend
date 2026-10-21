import { MigrationInterface, QueryRunner } from 'typeorm';

const permissions = [
  { refId: 'PER00000422', name: 'View Promotional Offers', code: 'promotional_offers.read', module: 'promotional_offers', action: 'read' },
  { refId: 'PER00000423', name: 'Create Promotional Offers', code: 'promotional_offers.create', module: 'promotional_offers', action: 'create' },
  { refId: 'PER00000424', name: 'Update Promotional Offers', code: 'promotional_offers.update', module: 'promotional_offers', action: 'update' },
  { refId: 'PER00000425', name: 'Change Promotional Offers Status', code: 'promotional_offers.status', module: 'promotional_offers', action: 'status' },
  { refId: 'PER00000426', name: 'Delete Promotional Offers', code: 'promotional_offers.delete', module: 'promotional_offers', action: 'delete' },
];

export class AddPromotionalOffers1786014000000 implements MigrationInterface {
  name = 'AddPromotionalOffers1786014000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "promotional_offers_offer_type_enum" AS ENUM ('bogo', 'buy_x_get_y', 'gift_on_cart_value', 'buy_more_save_more');
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "promotional_offer_targets_role_enum" AS ENUM ('qualifying', 'reward', 'gift', 'tier_group');
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "promotional_offer_reservations_status_enum" AS ENUM ('reserved', 'consumed', 'released');
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "promotional_offers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" varchar(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" varchar(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" varchar(255),
        "deleted_at" TIMESTAMPTZ,
        "name" varchar(255) NOT NULL,
        "internal_description" text,
        "customer_message" varchar(500) NOT NULL,
        "offer_type" "promotional_offers_offer_type_enum" NOT NULL,
        "status" "brands_status_enum" NOT NULL DEFAULT 'inactive',
        "start_date" TIMESTAMPTZ NOT NULL,
        "expiry_date" TIMESTAMPTZ NOT NULL,
        "priority" integer NOT NULL DEFAULT 100,
        "usage_limit" integer,
        "same_user_limit" integer,
        "config" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_promotional_offers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_promotional_offers_ref_id" UNIQUE ("ref_id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "promotional_offer_targets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" varchar(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" varchar(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" varchar(255),
        "deleted_at" TIMESTAMPTZ,
        "offer_id" uuid NOT NULL,
        "role" "promotional_offer_targets_role_enum" NOT NULL,
        "product_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "quantity" integer,
        CONSTRAINT "PK_promotional_offer_targets" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_promotional_offer_targets_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_promotional_offer_target" UNIQUE ("offer_id", "role", "variant_id"),
        CONSTRAINT "FK_promotional_offer_targets_offer" FOREIGN KEY ("offer_id") REFERENCES "promotional_offers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_promotional_offer_targets_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_promotional_offer_targets_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "promotional_offer_reservations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" varchar(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" varchar(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" varchar(255),
        "deleted_at" TIMESTAMPTZ,
        "offer_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "payment_request_id" uuid,
        "order_id" uuid,
        "status" "promotional_offer_reservations_status_enum" NOT NULL,
        "discount_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "expires_at" TIMESTAMPTZ,
        "idempotency_key" varchar(200) NOT NULL,
        CONSTRAINT "PK_promotional_offer_reservations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_promotional_offer_reservations_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_promotional_offer_reservations_offer" FOREIGN KEY ("offer_id") REFERENCES "promotional_offers"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_promo_reservation_payment"
      ON "promotional_offer_reservations" ("offer_id", "payment_request_id")
      WHERE "payment_request_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_promo_reservation_order"
      ON "promotional_offer_reservations" ("offer_id", "order_id")
      WHERE "order_id" IS NOT NULL
    `);

    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "promotion_discount" numeric(12,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "promotion_snapshot" jsonb`);
    await queryRunner.query(`ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "promotion_discount" numeric(12,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "promotion_snapshot" jsonb`);
    await queryRunner.query(`ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "promotion_discount" numeric(12,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "catalog_unit_price" numeric(12,2)`);
    await queryRunner.query(`ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "line_source" varchar(20) NOT NULL DEFAULT 'customer'`);
    await queryRunner.query(`ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "promotion_offer_id" uuid`);
    await queryRunner.query(`ALTER TABLE "payment_request_items" ADD COLUMN IF NOT EXISTS "line_source" varchar(20) NOT NULL DEFAULT 'customer'`);
    await queryRunner.query(`ALTER TABLE "payment_request_items" ADD COLUMN IF NOT EXISTS "promotion_offer_id" uuid`);
    await queryRunner.query(`ALTER TABLE "payment_request_items" ADD COLUMN IF NOT EXISTS "catalog_unit_price" numeric(12,2)`);

    await queryRunner.query(`
      INSERT INTO "admin_setting" ("id", "ref_id", "key", "value", "status", "description", "created_by", "updated_by", "created_at", "updated_at")
      SELECT uuid_generate_v4(), 'SETPROMOFLAG01', 'PROMOTIONAL_OFFERS_ENABLED', 'false', 'inactive',
        'Runtime switch for Cureka native promotional offers', 'system', 'system', now(), now()
      WHERE NOT EXISTS (
        SELECT 1 FROM "admin_setting" WHERE "key" = 'PROMOTIONAL_OFFERS_ENABLED' AND "deleted_at" IS NULL
      )
    `);

    for (const permission of permissions) {
      await queryRunner.query(
        `
        INSERT INTO "permissions" ("ref_id", "code", "name", "module", "action", "status", "created_by")
        SELECT $1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::permissions_action_enum, 'active', 'system'
        WHERE NOT EXISTS (
          SELECT 1 FROM "permissions"
          WHERE (LOWER("code") = LOWER($2::varchar) OR "ref_id" = $1::varchar) AND "deleted_at" IS NULL
        )
      `,
        [permission.refId, permission.code, permission.name, permission.module, permission.action],
      );
    }

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id"
      FROM "roles" r
      JOIN "permissions" p ON p."code" IN ('promotional_offers.read', 'promotional_offers.create', 'promotional_offers.update', 'promotional_offers.status', 'promotional_offers.delete')
      WHERE r."slug" IN ('super_admin', 'admin')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "role_permissions" WHERE "permission_id" IN (SELECT "id" FROM "permissions" WHERE "code" LIKE 'promotional_offers.%')`);
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" LIKE 'promotional_offers.%'`);
    await queryRunner.query(`DELETE FROM "admin_setting" WHERE "key" = 'PROMOTIONAL_OFFERS_ENABLED'`);
    await queryRunner.query(`ALTER TABLE "payment_request_items" DROP COLUMN IF EXISTS "catalog_unit_price"`);
    await queryRunner.query(`ALTER TABLE "payment_request_items" DROP COLUMN IF EXISTS "promotion_offer_id"`);
    await queryRunner.query(`ALTER TABLE "payment_request_items" DROP COLUMN IF EXISTS "line_source"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN IF EXISTS "promotion_offer_id"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN IF EXISTS "line_source"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN IF EXISTS "catalog_unit_price"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN IF EXISTS "promotion_discount"`);
    await queryRunner.query(`ALTER TABLE "payment_requests" DROP COLUMN IF EXISTS "promotion_snapshot"`);
    await queryRunner.query(`ALTER TABLE "payment_requests" DROP COLUMN IF EXISTS "promotion_discount"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "promotion_snapshot"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "promotion_discount"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "promotional_offer_reservations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "promotional_offer_targets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "promotional_offers"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "promotional_offer_reservations_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "promotional_offer_targets_role_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "promotional_offers_offer_type_enum"`);
  }
}
