import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrdersModuleTables1780823000000 implements MigrationInterface {
  name = 'CreateOrdersModuleTables1780823000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."orders_payment_method_enum"
      AS ENUM ('COD', 'WALLET', 'RAZORPAY', 'CASHFREE')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."orders_payment_status_enum"
      AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."orders_order_status_enum"
      AS ENUM ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED')
    `);

    await queryRunner.query(`
      CREATE TABLE "carts" (
        "id"          uuid                 NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"      character varying(11) NOT NULL,
        "user_id"     uuid                 NOT NULL,
        "is_active"   boolean              NOT NULL DEFAULT true,
        "created_by"  character varying(255),
        "updated_by"  character varying(255),
        "created_at"  timestamptz          NOT NULL DEFAULT now(),
        "updated_at"  timestamptz          NOT NULL DEFAULT now(),
        "deleted_at"  timestamptz,
        CONSTRAINT "PK_carts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_carts_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_carts_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_carts_user_id" ON "carts" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_carts_is_active" ON "carts" ("is_active")`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_carts_one_active_per_user"
      ON "carts" ("user_id")
      WHERE "is_active" = true AND "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "cart_items" (
        "id"          uuid                 NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"      character varying(11) NOT NULL,
        "cart_id"     uuid                 NOT NULL,
        "product_id"  uuid                 NOT NULL,
        "variant_id"  uuid                 NOT NULL,
        "quantity"    integer              NOT NULL,
        "created_by"  character varying(255),
        "updated_by"  character varying(255),
        "created_at"  timestamptz          NOT NULL DEFAULT now(),
        "updated_at"  timestamptz          NOT NULL DEFAULT now(),
        "deleted_at"  timestamptz,
        CONSTRAINT "PK_cart_items" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cart_items_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_cart_items_cart_id" FOREIGN KEY ("cart_id")
          REFERENCES "carts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cart_items_product_id" FOREIGN KEY ("product_id")
          REFERENCES "products"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cart_items_variant_id" FOREIGN KEY ("variant_id")
          REFERENCES "product_variants"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_cart_items_cart_id" ON "cart_items" ("cart_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_cart_items_product_id" ON "cart_items" ("product_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_cart_items_variant_id" ON "cart_items" ("variant_id")`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_cart_items_unique_variant_in_active_cart"
      ON "cart_items" ("cart_id", "variant_id")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id"               uuid                          NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"           character varying(11)        NOT NULL,
        "order_number"     character varying(30)        NOT NULL,
        "user_id"          uuid                          NOT NULL,
        "subtotal"         decimal(12,2)                 NOT NULL,
        "discount_amount"  decimal(12,2)                 NOT NULL DEFAULT 0,
        "shipping_amount"  decimal(12,2)                 NOT NULL DEFAULT 0,
        "grand_total"      decimal(12,2)                 NOT NULL,
        "payment_method"   "public"."orders_payment_method_enum" NOT NULL,
        "payment_status"   "public"."orders_payment_status_enum" NOT NULL DEFAULT 'PENDING',
        "order_status"     "public"."orders_order_status_enum" NOT NULL DEFAULT 'PENDING',
        "recipient_name"   character varying(150)        NOT NULL,
        "phone_number"     character varying(10)         NOT NULL,
        "pincode"          character varying(6)          NOT NULL,
        "address_line1"    character varying(255)        NOT NULL,
        "address_line2"    character varying(255),
        "landmark"         character varying(255),
        "city"             character varying(100)        NOT NULL,
        "state"            character varying(100)        NOT NULL,
        "notes"            text,
        "placed_at"        timestamptz,
        "created_by"       character varying(255),
        "updated_by"       character varying(255),
        "created_at"       timestamptz                   NOT NULL DEFAULT now(),
        "updated_at"       timestamptz                   NOT NULL DEFAULT now(),
        "deleted_at"       timestamptz,
        CONSTRAINT "PK_orders" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_orders_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_orders_order_number" UNIQUE ("order_number"),
        CONSTRAINT "FK_orders_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_orders_user_id" ON "orders" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_orders_status" ON "orders" ("order_status")`);
    await queryRunner.query(`CREATE INDEX "IDX_orders_placed_at" ON "orders" ("placed_at")`);

    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "id"             uuid                 NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"         character varying(11) NOT NULL,
        "order_id"       uuid                 NOT NULL,
        "product_id"     uuid                 NOT NULL,
        "variant_id"     uuid                 NOT NULL,
        "sku"            character varying(100) NOT NULL,
        "product_name"   character varying(500) NOT NULL,
        "variant_name"   character varying(500),
        "quantity"       integer              NOT NULL,
        "unit_price"     decimal(12,2)        NOT NULL,
        "total_price"    decimal(12,2)        NOT NULL,
        "created_by"     character varying(255),
        "updated_by"     character varying(255),
        "created_at"     timestamptz          NOT NULL DEFAULT now(),
        "updated_at"     timestamptz          NOT NULL DEFAULT now(),
        "deleted_at"     timestamptz,
        CONSTRAINT "PK_order_items" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_order_items_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_order_items_order_id" FOREIGN KEY ("order_id")
          REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_order_items_product_id" FOREIGN KEY ("product_id")
          REFERENCES "products"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_order_items_variant_id" FOREIGN KEY ("variant_id")
          REFERENCES "product_variants"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_order_items_order_id" ON "order_items" ("order_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_order_items_product_id" ON "order_items" ("product_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_order_items_variant_id" ON "order_items" ("variant_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_items_variant_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_items_product_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_items_order_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "order_items"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_placed_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orders"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_cart_items_unique_variant_in_active_cart"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cart_items_variant_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cart_items_product_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cart_items_cart_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cart_items"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_carts_one_active_per_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_carts_is_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_carts_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "carts"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."orders_order_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."orders_payment_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."orders_payment_method_enum"`);
  }
}
