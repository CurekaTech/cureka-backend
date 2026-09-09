import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRefundRequestTables1785980000000 implements MigrationInterface {
  name = 'CreateRefundRequestTables1785980000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."refund_requests_reason_enum" AS ENUM (
        'CUSTOMER_CANCELLATION',
        'OUT_OF_STOCK',
        'WRONG_PRODUCT',
        'DELAYED_DELIVERY',
        'RTO',
        'DAMAGED_PRODUCT',
        'OTHER'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."refund_requests_status_enum" AS ENUM (
        'REQUESTED',
        'UNDER_REVIEW',
        'AWAITING_APPROVAL',
        'APPROVED',
        'REJECTED',
        'FINANCE_PROCESSING',
        'PROCESSING',
        'PROCESSED',
        'FAILED',
        'CANCELLED',
        'CLOSED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."refund_requests_payment_provider_enum" AS ENUM (
        'GOKWIK',
        'RAZORPAY',
        'CASHFREE',
        'COD',
        'OTHER'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."refund_requests_requested_by_type_enum" AS ENUM (
        'CUSTOMER',
        'ADMIN',
        'SYSTEM'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."refund_request_history_action_enum" AS ENUM (
        'CREATED',
        'REVIEWED',
        'MOVED_TO_AWAITING_APPROVAL',
        'APPROVED',
        'REJECTED',
        'ASSIGNED',
        'COMMENT_ADDED',
        'INITIATED',
        'RETRIED',
        'RECONCILED',
        'PROVIDER_UPDATED',
        'FAILED',
        'PROCESSED',
        'CLOSED',
        'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "refund_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "order_id" uuid NOT NULL,
        "order_number" character varying(30) NOT NULL,
        "customer_id" uuid,
        "payment_request_id" uuid,
        "reason" "public"."refund_requests_reason_enum" NOT NULL,
        "reason_details" text,
        "requested_amount" numeric(12,2) NOT NULL,
        "approved_amount" numeric(12,2),
        "currency" character varying(5) NOT NULL DEFAULT 'INR',
        "status" "public"."refund_requests_status_enum" NOT NULL DEFAULT 'REQUESTED',
        "original_payment_method" character varying(50) NOT NULL,
        "payment_provider" "public"."refund_requests_payment_provider_enum" NOT NULL,
        "provider_payment_id" character varying(200),
        "provider_refund_id" character varying(200),
        "provider_refund_status" character varying(80),
        "merchant_refund_reference" character varying(64) NOT NULL,
        "provider_response_reference" character varying(200),
        "requested_by_type" "public"."refund_requests_requested_by_type_enum" NOT NULL,
        "requested_by_id" character varying(64),
        "assigned_to_user_id" uuid,
        "assigned_role_id" uuid,
        "reviewed_by" character varying(64),
        "reviewed_at" TIMESTAMPTZ,
        "approved_by" character varying(64),
        "approved_at" TIMESTAMPTZ,
        "rejected_by" character varying(64),
        "rejected_at" TIMESTAMPTZ,
        "rejection_reason" text,
        "processing_started_by" character varying(64),
        "processing_started_at" TIMESTAMPTZ,
        "processed_at" TIMESTAMPTZ,
        "failed_at" TIMESTAMPTZ,
        "failure_code" character varying(80),
        "failure_message" text,
        "expected_credit_from" TIMESTAMPTZ,
        "expected_credit_to" TIMESTAMPTZ,
        "due_at" TIMESTAMPTZ,
        "escalation_level" integer NOT NULL DEFAULT 0,
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_refund_requests" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_refund_requests_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_refund_requests_merchant_refund_reference" UNIQUE ("merchant_refund_reference"),
        CONSTRAINT "CHK_refund_requests_requested_amount_positive" CHECK ("requested_amount" > 0),
        CONSTRAINT "CHK_refund_requests_approved_amount_positive" CHECK ("approved_amount" IS NULL OR "approved_amount" > 0),
        CONSTRAINT "FK_refund_requests_order_id" FOREIGN KEY ("order_id")
          REFERENCES "orders"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_refund_requests_customer_id" FOREIGN KEY ("customer_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_refund_requests_order_id" ON "refund_requests" ("order_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_refund_requests_order_number" ON "refund_requests" ("order_number")`);
    await queryRunner.query(`CREATE INDEX "IDX_refund_requests_customer_id" ON "refund_requests" ("customer_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_refund_requests_status" ON "refund_requests" ("status")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_refund_requests_payment_provider" ON "refund_requests" ("payment_provider")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_refund_requests_created_at" ON "refund_requests" ("created_at")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_refund_requests_assigned_to_user_id" ON "refund_requests" ("assigned_to_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refund_requests_provider_refund_id" ON "refund_requests" ("provider_refund_id")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_refund_requests_provider_refund_id"
      ON "refund_requests" ("provider_refund_id")
      WHERE "provider_refund_id" IS NOT NULL AND "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_refund_requests_one_active_per_order"
      ON "refund_requests" ("order_id")
      WHERE "deleted_at" IS NULL
        AND "status" NOT IN ('REJECTED', 'CANCELLED', 'CLOSED')
    `);

    await queryRunner.query(`
      CREATE TABLE "refund_request_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "refund_request_id" uuid NOT NULL,
        "from_status" "public"."refund_requests_status_enum",
        "to_status" "public"."refund_requests_status_enum" NOT NULL,
        "action" "public"."refund_request_history_action_enum" NOT NULL,
        "comment" text,
        "performed_by" character varying(255) NOT NULL,
        "performed_by_role" character varying(64),
        "metadata" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refund_request_history" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refund_request_history_refund_request_id" FOREIGN KEY ("refund_request_id")
          REFERENCES "refund_requests"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_refund_request_history_refund_request_id" ON "refund_request_history" ("refund_request_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refund_request_history_created_at" ON "refund_request_history" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refund_request_history_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refund_request_history_refund_request_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refund_request_history"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_refund_requests_one_active_per_order"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_refund_requests_provider_refund_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refund_requests_provider_refund_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refund_requests_assigned_to_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refund_requests_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refund_requests_payment_provider"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refund_requests_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refund_requests_customer_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refund_requests_order_number"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refund_requests_order_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refund_requests"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."refund_request_history_action_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."refund_requests_requested_by_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."refund_requests_payment_provider_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."refund_requests_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."refund_requests_reason_enum"`);
  }
}
