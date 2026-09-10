import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive Subscribe & Save hardening:
 * - mandate, billing-cycle and history tables
 * - AutoPay readiness kept separate from first-order payment
 * - legacy AUTO_PAY rows without a verified mandate are forced to PAYMENT_LINK
 */
export class HardenProductSubscriptions1785982000000 implements MigrationInterface {
  name = 'HardenProductSubscriptions1785982000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."subscription_mandate_status_enum" AS ENUM (
        'PENDING', 'AUTHORIZED', 'CONFIRMED', 'PAUSED', 'FAILED',
        'EXPIRED', 'REVOKED', 'CANCELLED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."subscription_mandate_provider_enum" AS ENUM (
        'RAZORPAY', 'CASHFREE'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."subscription_billing_cycle_status_enum" AS ENUM (
        'SCHEDULED', 'SKIPPED', 'NOTIFICATION_SENT', 'DEBIT_PENDING',
        'LINK_GENERATED', 'PAID', 'PAID_ORDER_PENDING', 'FAILED', 'EXHAUSTED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."subscription_payment_attempt_kind_enum" AS ENUM (
        'AUTOPAY', 'MANUAL_LINK', 'FIRST_ORDER'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."subscription_history_action_enum" AS ENUM (
        'CREATED', 'ACTIVATED', 'PAUSED', 'RESUMED', 'SKIPPED', 'CANCELLED',
        'FREQUENCY_CHANGED', 'ADDRESS_CHANGED', 'QUANTITY_CHANGED',
        'MANDATE_UPDATED', 'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED',
        'ORDER_CREATED', 'ORDER_FINALIZATION_RETRY', 'ADMIN_RETRY',
        'LEGACY_MANUAL_LOCK', 'AUTOPAY_DISABLED'
      )
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."subscription_payment_status_enum"
      ADD VALUE IF NOT EXISTS 'RECONCILING'
    `);

    await queryRunner.query(`
      ALTER TABLE "product_subscription_configs"
      ADD COLUMN IF NOT EXISTS "quantity_change_allowed" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "product_subscription_configs"
      ADD COLUMN IF NOT EXISTS "mandate_max_amount" numeric(12,2)
    `);
    await queryRunner.query(`
      ALTER TABLE "product_subscription_configs"
      ADD COLUMN IF NOT EXISTS "timezone" character varying(64) NOT NULL DEFAULT 'Asia/Kolkata'
    `);
    await queryRunner.query(`
      ALTER TABLE "product_subscription_configs"
      ADD COLUMN IF NOT EXISTS "delivery_lead_days" integer NOT NULL DEFAULT 2
    `);
    await queryRunner.query(`
      ALTER TABLE "product_subscription_configs"
      ADD COLUMN IF NOT EXISTS "max_retry_attempts" integer NOT NULL DEFAULT 3
    `);
    await queryRunner.query(`
      ALTER TABLE "product_subscription_configs"
      ADD COLUMN IF NOT EXISTS "change_cutoff_hours" integer NOT NULL DEFAULT 12
    `);

    await queryRunner.query(`
      ALTER TABLE "user_product_subscriptions"
      ADD COLUMN IF NOT EXISTS "timezone" character varying(64) NOT NULL DEFAULT 'Asia/Kolkata'
    `);
    await queryRunner.query(`
      ALTER TABLE "user_product_subscriptions"
      ADD COLUMN IF NOT EXISTS "schedule_anchor_day" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "user_product_subscriptions"
      ADD COLUMN IF NOT EXISTS "autopay_ready" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "user_product_subscriptions"
      ADD COLUMN IF NOT EXISTS "skip_next_cycle" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "user_product_subscriptions"
      ADD COLUMN IF NOT EXISTS "first_order_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "user_product_subscriptions"
      ADD COLUMN IF NOT EXISTS "mandate_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "user_product_subscriptions"
      ADD COLUMN IF NOT EXISTS "mandate_max_amount" numeric(12,2)
    `);

    await queryRunner.query(`
      CREATE TABLE "subscription_mandates" (
        "id"                         uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"                     character varying(16) NOT NULL,
        "subscription_id"            uuid NOT NULL,
        "user_id"                    uuid NOT NULL,
        "provider"                   "public"."subscription_mandate_provider_enum" NOT NULL,
        "status"                     "public"."subscription_mandate_status_enum" NOT NULL DEFAULT 'PENDING',
        "max_amount"                 numeric(12,2) NOT NULL,
        "currency"                   character varying(5) NOT NULL DEFAULT 'INR',
        "gateway_customer_id"        character varying(255),
        "gateway_mandate_id"         character varying(255),
        "gateway_subscription_id"    character varying(255),
        "authorization_order_id"     character varying(255),
        "authorization_payment_id"   character varying(255),
        "valid_until"                TIMESTAMPTZ,
        "authorized_at"              TIMESTAMPTZ,
        "revoked_at"                 TIMESTAMPTZ,
        "consent_evidence"           jsonb,
        "failure_reason"             text,
        "metadata"                   jsonb,
        "created_by"                 character varying(255),
        "updated_by"                 character varying(255),
        "created_at"                 TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"                 TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at"                 TIMESTAMPTZ,
        CONSTRAINT "PK_subscription_mandates" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_subscription_mandates_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_subscription_mandates_subscription_id"
          FOREIGN KEY ("subscription_id") REFERENCES "user_product_subscriptions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_subscription_mandates_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_mandates_subscription_id" ON "subscription_mandates" ("subscription_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_mandates_user_id" ON "subscription_mandates" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_mandates_gateway_mandate_id" ON "subscription_mandates" ("gateway_mandate_id")`,
    );

    await queryRunner.query(`
      ALTER TABLE "user_product_subscriptions"
      ADD CONSTRAINT "FK_user_product_subscriptions_mandate_id"
      FOREIGN KEY ("mandate_id") REFERENCES "subscription_mandates"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "subscription_billing_cycles" (
        "id"                         uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"                     character varying(16) NOT NULL,
        "subscription_id"            uuid NOT NULL,
        "user_id"                    uuid NOT NULL,
        "billing_cycle_ref"          character varying(64) NOT NULL,
        "sequence"                   integer NOT NULL,
        "status"                     "public"."subscription_billing_cycle_status_enum" NOT NULL DEFAULT 'SCHEDULED',
        "charge_date"                TIMESTAMPTZ NOT NULL,
        "estimated_delivery_date"    TIMESTAMPTZ,
        "amount"                     numeric(12,2) NOT NULL,
        "currency"                   character varying(5) NOT NULL DEFAULT 'INR',
        "pricing_snapshot"           jsonb,
        "order_id"                   uuid,
        "payment_id"                 uuid,
        "skip_reason"                character varying(64),
        "failure_reason"             text,
        "retry_count"                integer NOT NULL DEFAULT 0,
        "notification_sent_at"       TIMESTAMPTZ,
        "debit_earliest_at"          TIMESTAMPTZ,
        "processing_started_at"      TIMESTAMPTZ,
        "created_by"                 character varying(255),
        "updated_by"                 character varying(255),
        "created_at"                 TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"                 TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at"                 TIMESTAMPTZ,
        CONSTRAINT "PK_subscription_billing_cycles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_subscription_billing_cycles_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_subscription_billing_cycles_subscription_ref"
          UNIQUE ("subscription_id", "billing_cycle_ref"),
        CONSTRAINT "FK_subscription_billing_cycles_subscription_id"
          FOREIGN KEY ("subscription_id") REFERENCES "user_product_subscriptions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_subscription_billing_cycles_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_subscription_billing_cycles_order_id"
          FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_subscription_billing_cycles_payment_id"
          FOREIGN KEY ("payment_id") REFERENCES "subscription_payments"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_billing_cycles_subscription_id" ON "subscription_billing_cycles" ("subscription_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_billing_cycles_status" ON "subscription_billing_cycles" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_billing_cycles_charge_date" ON "subscription_billing_cycles" ("charge_date")`,
    );

    await queryRunner.query(`
      ALTER TABLE "subscription_payments"
      ADD COLUMN IF NOT EXISTS "billing_cycle_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "subscription_payments"
      ADD COLUMN IF NOT EXISTS "order_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "subscription_payments"
      ADD COLUMN IF NOT EXISTS "attempt_kind" "public"."subscription_payment_attempt_kind_enum"
      NOT NULL DEFAULT 'MANUAL_LINK'
    `);
    await queryRunner.query(`
      ALTER TABLE "subscription_payments"
      ADD COLUMN IF NOT EXISTS "idempotency_key" character varying(128)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_subscription_payments_idempotency_key"
      ON "subscription_payments" ("idempotency_key")
      WHERE "idempotency_key" IS NOT NULL AND "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_subscription_payments_billing_cycle_id'
        ) THEN
          ALTER TABLE "subscription_payments"
          ADD CONSTRAINT "FK_subscription_payments_billing_cycle_id"
          FOREIGN KEY ("billing_cycle_id") REFERENCES "subscription_billing_cycles"("id")
          ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_subscription_payments_order_id'
        ) THEN
          ALTER TABLE "subscription_payments"
          ADD CONSTRAINT "FK_subscription_payments_order_id"
          FOREIGN KEY ("order_id") REFERENCES "orders"("id")
          ON DELETE SET NULL;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE "subscription_status_history" (
        "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"          character varying(16) NOT NULL,
        "subscription_id" uuid NOT NULL,
        "action"          "public"."subscription_history_action_enum" NOT NULL,
        "from_status"     character varying(64),
        "to_status"       character varying(64),
        "performed_by"    character varying(255) NOT NULL,
        "reason"          text,
        "details"         jsonb,
        "created_by"      character varying(255),
        "updated_by"      character varying(255),
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at"      TIMESTAMPTZ,
        CONSTRAINT "PK_subscription_status_history" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_subscription_status_history_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_subscription_status_history_subscription_id"
          FOREIGN KEY ("subscription_id") REFERENCES "user_product_subscriptions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_status_history_subscription_id" ON "subscription_status_history" ("subscription_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "subscription_webhook_events" (
        "id"            uuid NOT NULL DEFAULT uuid_generate_v4(),
        "provider"      character varying(32) NOT NULL,
        "event_id"      character varying(255) NOT NULL,
        "event_type"    character varying(128) NOT NULL,
        "processed_at"  TIMESTAMPTZ NOT NULL,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_subscription_webhook_events" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_subscription_webhook_events_provider_event"
          UNIQUE ("provider", "event_id")
      )
    `);

    await queryRunner.query(`
      UPDATE "user_product_subscriptions"
      SET
        "renewal_method" = 'PAYMENT_LINK',
        "autopay_ready" = false,
        "updated_by" = 'migration:legacy-mandate-lock'
      WHERE "deleted_at" IS NULL
        AND (
          "gateway_mandate_id" IS NULL
          OR BTRIM("gateway_mandate_id") = ''
        )
        AND "renewal_method" = 'AUTO_PAY'
    `);

    await queryRunner.query(`
      INSERT INTO "subscription_status_history" (
        "ref_id", "subscription_id", "action", "from_status", "to_status",
        "performed_by", "reason", "created_by", "updated_by"
      )
      SELECT
        'LCK' || to_char(now(), 'YYYY') || lpad((row_number() OVER ())::text, 6, '0'),
        "id",
        'LEGACY_MANUAL_LOCK',
        'AUTO_PAY',
        "status"::text,
        'migration',
        'Existing AUTO_PAY rows without a verified mandate must not auto-debit',
        'migration',
        'migration'
      FROM "user_product_subscriptions"
      WHERE "updated_by" = 'migration:legacy-mandate-lock'
        AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "subscription_webhook_events"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_subscription_status_history_subscription_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscription_status_history"`);

    await queryRunner.query(
      `ALTER TABLE "subscription_payments" DROP CONSTRAINT IF EXISTS "FK_subscription_payments_order_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_payments" DROP CONSTRAINT IF EXISTS "FK_subscription_payments_billing_cycle_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_subscription_payments_idempotency_key"`);
    await queryRunner.query(
      `ALTER TABLE "subscription_payments" DROP COLUMN IF EXISTS "idempotency_key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_payments" DROP COLUMN IF EXISTS "attempt_kind"`,
    );
    await queryRunner.query(`ALTER TABLE "subscription_payments" DROP COLUMN IF EXISTS "order_id"`);
    await queryRunner.query(
      `ALTER TABLE "subscription_payments" DROP COLUMN IF EXISTS "billing_cycle_id"`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_subscription_billing_cycles_charge_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_subscription_billing_cycles_status"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_subscription_billing_cycles_subscription_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "subscription_billing_cycles"`);

    await queryRunner.query(
      `ALTER TABLE "user_product_subscriptions" DROP CONSTRAINT IF EXISTS "FK_user_product_subscriptions_mandate_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_subscription_mandates_gateway_mandate_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_subscription_mandates_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_subscription_mandates_subscription_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscription_mandates"`);

    await queryRunner.query(
      `ALTER TABLE "user_product_subscriptions" DROP COLUMN IF EXISTS "mandate_max_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_product_subscriptions" DROP COLUMN IF EXISTS "mandate_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_product_subscriptions" DROP COLUMN IF EXISTS "first_order_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_product_subscriptions" DROP COLUMN IF EXISTS "skip_next_cycle"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_product_subscriptions" DROP COLUMN IF EXISTS "autopay_ready"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_product_subscriptions" DROP COLUMN IF EXISTS "schedule_anchor_day"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_product_subscriptions" DROP COLUMN IF EXISTS "timezone"`,
    );

    await queryRunner.query(
      `ALTER TABLE "product_subscription_configs" DROP COLUMN IF EXISTS "change_cutoff_hours"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_subscription_configs" DROP COLUMN IF EXISTS "max_retry_attempts"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_subscription_configs" DROP COLUMN IF EXISTS "delivery_lead_days"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_subscription_configs" DROP COLUMN IF EXISTS "timezone"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_subscription_configs" DROP COLUMN IF EXISTS "mandate_max_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_subscription_configs" DROP COLUMN IF EXISTS "quantity_change_allowed"`,
    );

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."subscription_history_action_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."subscription_payment_attempt_kind_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."subscription_billing_cycle_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."subscription_mandate_provider_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."subscription_mandate_status_enum"`);
  }
}
