import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentRequestTables1780841000000 implements MigrationInterface {
  name = 'CreatePaymentRequestTables1780841000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."payment_requests_status_enum"
      AS ENUM ('PAYMENT_PENDING', 'LINK_GENERATED', 'PAID', 'CANCELLED', 'EXPIRED')
    `);

    await queryRunner.query(`
      CREATE TABLE "payment_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(11) NOT NULL,
        "customer_id" uuid NOT NULL,
        "status" "public"."payment_requests_status_enum" NOT NULL DEFAULT 'PAYMENT_PENDING',
        "subtotal" decimal(12,2) NOT NULL DEFAULT 0,
        "discount" decimal(12,2) NOT NULL DEFAULT 0,
        "tax" decimal(12,2) NOT NULL DEFAULT 0,
        "total_amount" decimal(12,2) NOT NULL,
        "currency" character varying(5) NOT NULL DEFAULT 'INR',
        "notes" text,
        "payment_provider" character varying(50) NOT NULL DEFAULT 'RAZORPAY',
        "payment_link" character varying(500),
        "provider_reference_id" character varying(100),
        "payment_reference" character varying(100),
        "expires_at" timestamptz,
        "paid_at" timestamptz,
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_payment_requests" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payment_requests_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_payment_requests_customer_id" FOREIGN KEY ("customer_id")
          REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_payment_requests_customer_id" ON "payment_requests" ("customer_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_payment_requests_status" ON "payment_requests" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_payment_requests_provider_reference_id" ON "payment_requests" ("provider_reference_id")`);

    await queryRunner.query(`
      CREATE TABLE "payment_request_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(11) NOT NULL,
        "payment_request_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "quantity" integer NOT NULL,
        "unit_price" decimal(12,2) NOT NULL,
        "discount" decimal(12,2) NOT NULL DEFAULT 0,
        "tax" decimal(12,2) NOT NULL DEFAULT 0,
        "total" decimal(12,2) NOT NULL,
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_payment_request_items" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payment_request_items_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_payment_request_items_payment_request_id" FOREIGN KEY ("payment_request_id")
          REFERENCES "payment_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_payment_request_items_product_id" FOREIGN KEY ("product_id")
          REFERENCES "products"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_payment_request_items_variant_id" FOREIGN KEY ("variant_id")
          REFERENCES "product_variants"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_payment_request_items_payment_request_id" ON "payment_request_items" ("payment_request_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_payment_request_items_product_id" ON "payment_request_items" ("product_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_payment_request_items_variant_id" ON "payment_request_items" ("variant_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_request_items_variant_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_request_items_product_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_request_items_payment_request_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_request_items"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_requests_provider_reference_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_requests_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_requests_customer_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_requests"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."payment_requests_status_enum"`);
  }
}
