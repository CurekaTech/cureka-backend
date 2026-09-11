import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReturnRequests1785980800000 implements MigrationInterface {
  name = 'CreateReturnRequests1785980800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."return_requests_status_enum" AS ENUM (
        'REQUESTED',
        'UNDER_REVIEW',
        'ADDITIONAL_INFORMATION_REQUIRED',
        'APPROVED',
        'REJECTED',
        'PICKUP_SCHEDULED',
        'PICKUP_ATTEMPTED',
        'PICKED_UP',
        'IN_TRANSIT_TO_WAREHOUSE',
        'RECEIVED_AT_WAREHOUSE',
        'QC_PENDING',
        'QC_PASSED',
        'QC_FAILED',
        'REFUND_PENDING',
        'REFUND_INITIATED',
        'REFUND_COMPLETED',
        'REPLACEMENT_PENDING',
        'REPLACEMENT_CREATED',
        'CANCELLED_BY_CUSTOMER',
        'COMPLETED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."return_requests_resolution_enum" AS ENUM ('REFUND', 'REPLACEMENT')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."return_requests_requested_by_type_enum" AS ENUM ('CUSTOMER', 'ADMIN', 'SYSTEM')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."return_pickups_provider_enum" AS ENUM ('MANUAL', 'SHIPWAY', 'UNICOMMERCE')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."return_pickups_status_enum" AS ENUM (
        'SCHEDULED', 'ATTEMPTED', 'PICKED_UP', 'IN_TRANSIT',
        'DELIVERED_TO_WAREHOUSE', 'CANCELLED', 'FAILED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."return_qc_records_result_enum" AS ENUM ('PASS', 'FAIL', 'PARTIAL')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."return_evidences_media_type_enum" AS ENUM ('IMAGE', 'VIDEO')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."return_evidences_source_enum" AS ENUM ('CUSTOMER', 'ADMIN', 'QC')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."return_status_history_action_enum" AS ENUM (
        'CREATED', 'REVIEWED', 'ADDITIONAL_INFORMATION_REQUESTED', 'ADDITIONAL_INFORMATION_SUBMITTED',
        'APPROVED', 'REJECTED', 'ASSIGNED', 'COMMENT_ADDED', 'INTERNAL_NOTE_ADDED', 'EVIDENCE_ADDED',
        'PICKUP_SCHEDULED', 'PICKUP_UPDATED', 'PICKED_UP', 'RECEIVED_AT_WAREHOUSE', 'QC_SUBMITTED',
        'NO_PICKUP_APPROVED', 'ELIGIBILITY_OVERRIDDEN', 'REFUND_LINKED', 'REFUND_STATUS_UPDATED',
        'REPLACEMENT_LINKED', 'COMPLETED', 'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "return_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "return_number" character varying(30) NOT NULL,
        "order_id" uuid NOT NULL,
        "order_number" character varying(30) NOT NULL,
        "customer_id" uuid,
        "status" "public"."return_requests_status_enum" NOT NULL DEFAULT 'REQUESTED',
        "resolution" "public"."return_requests_resolution_enum" NOT NULL,
        "reason_id" uuid NOT NULL,
        "reason_code" character varying(100) NOT NULL,
        "reason_title" character varying(255) NOT NULL,
        "customer_comments" text,
        "condition_declarations" jsonb,
        "pickup_required" boolean NOT NULL DEFAULT true,
        "qc_required" boolean NOT NULL DEFAULT true,
        "pickup_address" jsonb,
        "is_expired_product_claim" boolean NOT NULL DEFAULT false,
        "delivered_at" TIMESTAMPTZ,
        "return_window_expires_at" TIMESTAMPTZ,
        "requested_by_type" "public"."return_requests_requested_by_type_enum" NOT NULL,
        "requested_by_id" character varying(64),
        "is_admin_initiated" boolean NOT NULL DEFAULT false,
        "eligibility_overridden" boolean NOT NULL DEFAULT false,
        "override_reason" text,
        "internal_justification" text,
        "customer_visible_explanation" text,
        "eligibility_snapshot" jsonb,
        "assigned_to_user_id" uuid,
        "assigned_role_id" uuid,
        "reviewed_by" character varying(64),
        "reviewed_at" TIMESTAMPTZ,
        "approved_by" character varying(64),
        "approved_at" TIMESTAMPTZ,
        "rejected_by" character varying(64),
        "rejected_at" TIMESTAMPTZ,
        "rejection_reason" text,
        "information_requested_at" TIMESTAMPTZ,
        "information_request_message" text,
        "picked_up_at" TIMESTAMPTZ,
        "received_at_warehouse_at" TIMESTAMPTZ,
        "qc_completed_at" TIMESTAMPTZ,
        "no_pickup_approved" boolean NOT NULL DEFAULT false,
        "no_pickup_approved_by" character varying(64),
        "inventory_restored" boolean NOT NULL DEFAULT false,
        "estimated_refund_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "approved_refund_amount" numeric(12,2),
        "currency" character varying(5) NOT NULL DEFAULT 'INR',
        "amount_breakdown" jsonb,
        "refund_request_id" uuid,
        "refund_linked_at" TIMESTAMPTZ,
        "replacement_order_id" uuid,
        "replacement_linked_at" TIMESTAMPTZ,
        "cancelled_at" TIMESTAMPTZ,
        "cancelled_by" character varying(64),
        "completed_at" TIMESTAMPTZ,
        "version" integer NOT NULL DEFAULT 1,
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_return_requests" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_return_requests_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_return_requests_order_id" FOREIGN KEY ("order_id")
          REFERENCES "orders"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_return_requests_customer_id" FOREIGN KEY ("customer_id")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_return_requests_reason_id" FOREIGN KEY ("reason_id")
          REFERENCES "reason_masters"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_return_requests_return_number" ON "return_requests" ("return_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_return_requests_order_id" ON "return_requests" ("order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_return_requests_order_number" ON "return_requests" ("order_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_return_requests_customer_id" ON "return_requests" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_return_requests_status" ON "return_requests" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_return_requests_resolution" ON "return_requests" ("resolution")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_return_requests_reason_id" ON "return_requests" ("reason_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_return_requests_assigned_to_user_id" ON "return_requests" ("assigned_to_user_id")`,
    );
    // Partial unique indexes: one refund and one replacement per return, while
    // still allowing many rows to leave these columns null.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_return_requests_refund_request_id"
      ON "return_requests" ("refund_request_id")
      WHERE "refund_request_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_return_requests_replacement_order_id"
      ON "return_requests" ("replacement_order_id")
      WHERE "replacement_order_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "return_request_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "return_request_id" uuid NOT NULL,
        "order_item_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "sku" character varying(100) NOT NULL,
        "product_name" character varying(500) NOT NULL,
        "variant_name" character varying(500),
        "quantity" integer NOT NULL,
        "unit_price" numeric(12,2) NOT NULL,
        "refundable_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "policy_snapshot" jsonb,
        "delivered_at" TIMESTAMPTZ,
        "accepted_quantity" integer,
        "rejected_quantity" integer,
        "qc_rejection_reason" text,
        "replacement_variant_id" uuid,
        "replacement_sku" character varying(100),
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_return_request_items" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_return_request_items_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "CHK_return_request_items_quantity" CHECK ("quantity" > 0),
        CONSTRAINT "FK_return_request_items_return_request_id" FOREIGN KEY ("return_request_id")
          REFERENCES "return_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_return_request_items_order_item_id" FOREIGN KEY ("order_item_id")
          REFERENCES "order_items"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_return_request_items_return_request_id" ON "return_request_items" ("return_request_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_return_request_items_order_item_id" ON "return_request_items" ("order_item_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "return_status_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "return_request_id" uuid NOT NULL,
        "from_status" "public"."return_requests_status_enum",
        "to_status" "public"."return_requests_status_enum" NOT NULL,
        "action" "public"."return_status_history_action_enum" NOT NULL,
        "comment" text,
        "is_customer_visible" boolean NOT NULL DEFAULT false,
        "performed_by" character varying(64) NOT NULL,
        "performed_by_role" character varying(64),
        "metadata" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_return_status_history" PRIMARY KEY ("id"),
        CONSTRAINT "FK_return_status_history_return_request_id" FOREIGN KEY ("return_request_id")
          REFERENCES "return_requests"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_return_status_history_return_request_id" ON "return_status_history" ("return_request_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "return_evidences" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "return_request_id" uuid NOT NULL,
        "return_request_item_id" uuid,
        "media_type" "public"."return_evidences_media_type_enum" NOT NULL,
        "source" "public"."return_evidences_source_enum" NOT NULL,
        "file" jsonb NOT NULL,
        "original_filename" character varying(255),
        "mime_type" character varying(100),
        "size_bytes" bigint,
        "uploaded_by_id" character varying(64),
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_return_evidences" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_return_evidences_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_return_evidences_return_request_id" FOREIGN KEY ("return_request_id")
          REFERENCES "return_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_return_evidences_return_request_item_id" FOREIGN KEY ("return_request_item_id")
          REFERENCES "return_request_items"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_return_evidences_return_request_id" ON "return_evidences" ("return_request_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "return_pickups" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "return_request_id" uuid NOT NULL,
        "provider" "public"."return_pickups_provider_enum" NOT NULL DEFAULT 'MANUAL',
        "status" "public"."return_pickups_status_enum" NOT NULL DEFAULT 'SCHEDULED',
        "reverse_awb_number" character varying(100),
        "provider_pickup_id" character varying(100),
        "courier_name" character varying(150),
        "tracking_url" character varying(500),
        "scheduled_at" TIMESTAMPTZ,
        "picked_up_at" TIMESTAMPTZ,
        "delivered_at_warehouse_at" TIMESTAMPTZ,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "last_event_at" TIMESTAMPTZ,
        "last_event_status" character varying(100),
        "failure_reason" text,
        "last_event_key" character varying(255),
        "provider_payload" jsonb,
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_return_pickups" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_return_pickups_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_return_pickups_return_request_id" FOREIGN KEY ("return_request_id")
          REFERENCES "return_requests"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_return_pickups_return_request_id" ON "return_pickups" ("return_request_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_return_pickups_reverse_awb_number" ON "return_pickups" ("reverse_awb_number")`,
    );
    // Guards against replaying the same courier webhook twice.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_return_pickups_last_event_key"
      ON "return_pickups" ("last_event_key")
      WHERE "last_event_key" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "return_qc_records" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "return_request_id" uuid NOT NULL,
        "return_request_item_id" uuid NOT NULL,
        "result" "public"."return_qc_records_result_enum" NOT NULL,
        "received_quantity" integer NOT NULL,
        "accepted_quantity" integer NOT NULL,
        "rejected_quantity" integer NOT NULL,
        "rejection_reason" text,
        "notes" text,
        "performed_by" character varying(64) NOT NULL,
        "performed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "warehouse_received_at" TIMESTAMPTZ,
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_return_qc_records" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_return_qc_records_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "CHK_return_qc_records_quantities" CHECK (
          "received_quantity" >= 0
          AND "accepted_quantity" >= 0
          AND "rejected_quantity" >= 0
          AND "accepted_quantity" + "rejected_quantity" = "received_quantity"
        ),
        CONSTRAINT "FK_return_qc_records_return_request_id" FOREIGN KEY ("return_request_id")
          REFERENCES "return_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_return_qc_records_return_request_item_id" FOREIGN KEY ("return_request_item_id")
          REFERENCES "return_request_items"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_return_qc_records_return_request_id" ON "return_qc_records" ("return_request_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "return_qc_records"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "return_pickups"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "return_evidences"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "return_status_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "return_request_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "return_requests"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."return_status_history_action_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."return_evidences_source_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."return_evidences_media_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."return_qc_records_result_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."return_pickups_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."return_pickups_provider_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."return_requests_requested_by_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."return_requests_resolution_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."return_requests_status_enum"`);
  }
}
