import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSubscriptionTables1785950000000 implements MigrationInterface {
  name = 'CreateSubscriptionTables1785950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."product_subscription_frequency_enum" AS ENUM(
        'MONTHLY', 'BI_MONTHLY', 'QUARTERLY'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."product_subscription_status_enum" AS ENUM(
        'PENDING_PAYMENT',
        'ACTIVE',
        'RENEWAL_PAYMENT_PENDING',
        'PAUSED',
        'PAST_DUE',
        'CANCELLED',
        'EXPIRED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."subscription_discount_type_enum" AS ENUM(
        'PERCENTAGE', 'FLAT'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."subscription_renewal_method_enum" AS ENUM(
        'PAYMENT_LINK', 'AUTO_PAY'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."subscription_missed_payment_action_enum" AS ENUM(
        'PAUSE', 'EXPIRE'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."subscription_payment_status_enum" AS ENUM(
        'PENDING', 'LINK_GENERATED', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."membership_billing_cycle_enum" AS ENUM(
        'MONTHLY', 'QUARTERLY', 'YEARLY'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."membership_plan_status_enum" AS ENUM(
        'ACTIVE', 'INACTIVE'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."membership_status_enum" AS ENUM(
        'PENDING_PAYMENT',
        'ACTIVE',
        'RENEWAL_PAYMENT_PENDING',
        'PAST_DUE',
        'PAUSED',
        'CANCELLED',
        'EXPIRED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."membership_benefit_type_enum" AS ENUM(
        'FREE_SHIPPING',
        'MEMBER_DISCOUNT',
        'EARLY_ACCESS',
        'PRIORITY_ACCESS',
        'CONSULTATION_OFFER'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."membership_benefit_value_type_enum" AS ENUM(
        'PERCENTAGE', 'FLAT', 'NONE'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."membership_payment_status_enum" AS ENUM(
        'PENDING', 'LINK_GENERATED', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_subscription_configs" (
        "id"                      uuid                                                      NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"                  character varying(16)                                     NOT NULL,
        "product_id"              uuid                                                      NOT NULL,
        "product_variant_id"      uuid,
        "enabled"                 boolean                                                   NOT NULL DEFAULT true,
        "frequencies"             jsonb                                                     NOT NULL DEFAULT '[]',
        "discount_type"           "public"."subscription_discount_type_enum",
        "discount_value"          numeric(12,2),
        "min_duration_months"     integer,
        "max_duration_months"     integer,
        "pause_allowed"           boolean                                                   NOT NULL DEFAULT true,
        "frequency_change_allowed" boolean                                                  NOT NULL DEFAULT true,
        "cancellation_allowed"    boolean                                                   NOT NULL DEFAULT true,
        "skip_allowed"            boolean                                                   NOT NULL DEFAULT true,
        "grace_period_days"       integer                                                   NOT NULL DEFAULT 7,
        "missed_payment_action"   "public"."subscription_missed_payment_action_enum"        NOT NULL DEFAULT 'PAUSE',
        "renewal_method"          "public"."subscription_renewal_method_enum"               NOT NULL DEFAULT 'PAYMENT_LINK',
        "reminder_offsets_json"   jsonb                                                     NOT NULL DEFAULT '[7,2,0]',
        "created_by"              character varying(255),
        "updated_by"              character varying(255),
        "created_at"              TIMESTAMPTZ                                               NOT NULL DEFAULT now(),
        "updated_at"              TIMESTAMPTZ                                               NOT NULL DEFAULT now(),
        "deleted_at"              TIMESTAMPTZ,
        CONSTRAINT "PK_product_subscription_configs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_product_subscription_configs_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_product_subscription_configs_product_id"
          FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_subscription_configs_product_variant_id"
          FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_product_subscription_configs_product_id" ON "product_subscription_configs" ("product_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_subscription_configs_product_variant_id" ON "product_subscription_configs" ("product_variant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_subscription_configs_enabled" ON "product_subscription_configs" ("enabled")`,
    );

    await queryRunner.query(`
      CREATE TABLE "user_product_subscriptions" (
        "id"                        uuid                                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"                    character varying(16)                             NOT NULL,
        "user_id"                   uuid                                              NOT NULL,
        "product_id"                uuid                                              NOT NULL,
        "product_variant_id"        uuid                                              NOT NULL,
        "address_id"                uuid                                              NOT NULL,
        "quantity"                  integer                                           NOT NULL,
        "frequency"                 "public"."product_subscription_frequency_enum"    NOT NULL,
        "subscription_price"        numeric(12,2)                                     NOT NULL,
        "discount_value"            numeric(12,2)                                     NOT NULL DEFAULT 0,
        "final_amount"              numeric(12,2)                                     NOT NULL,
        "discount_type"             "public"."subscription_discount_type_enum",
        "start_date"                TIMESTAMPTZ,
        "next_billing_date"         TIMESTAMPTZ,
        "next_delivery_date"        TIMESTAMPTZ,
        "status"                    "public"."product_subscription_status_enum"       NOT NULL,
        "renewal_method"            "public"."subscription_renewal_method_enum"       NOT NULL,
        "payment_gateway"           character varying(50),
        "gateway_customer_id"       character varying(255),
        "gateway_subscription_id"   character varying(255),
        "gateway_mandate_id"        character varying(255),
        "cancellation_date"         TIMESTAMPTZ,
        "cancellation_reason"       text,
        "paused_at"                 TIMESTAMPTZ,
        "pause_until"               TIMESTAMPTZ,
        "billing_cycle_sequence"    integer                                           NOT NULL DEFAULT 0,
        "config_id"                 uuid,
        "created_by"                character varying(255),
        "updated_by"                character varying(255),
        "created_at"                TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "updated_at"                TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "deleted_at"                TIMESTAMPTZ,
        CONSTRAINT "PK_user_product_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_product_subscriptions_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_user_product_subscriptions_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_product_subscriptions_product_id"
          FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_product_subscriptions_product_variant_id"
          FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_product_subscriptions_address_id"
          FOREIGN KEY ("address_id") REFERENCES "user_addresses"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_user_product_subscriptions_config_id"
          FOREIGN KEY ("config_id") REFERENCES "product_subscription_configs"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_user_product_subscriptions_user_id" ON "user_product_subscriptions" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_product_subscriptions_product_id" ON "user_product_subscriptions" ("product_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_product_subscriptions_product_variant_id" ON "user_product_subscriptions" ("product_variant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_product_subscriptions_status" ON "user_product_subscriptions" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_product_subscriptions_next_billing_date" ON "user_product_subscriptions" ("next_billing_date")`,
    );

    await queryRunner.query(`
      CREATE TABLE "subscription_payments" (
        "id"                  uuid                                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"              character varying(16)                             NOT NULL,
        "subscription_id"     uuid                                              NOT NULL,
        "user_id"             uuid                                              NOT NULL,
        "billing_cycle_ref"   character varying(64)                             NOT NULL,
        "amount"              numeric(12,2)                                     NOT NULL,
        "currency"            character varying(5)                              NOT NULL DEFAULT 'INR',
        "payment_gateway"     character varying(50),
        "gateway_order_id"    character varying(255),
        "gateway_payment_id"  character varying(255),
        "payment_link"        character varying(500),
        "status"              "public"."subscription_payment_status_enum"       NOT NULL,
        "billing_date"        TIMESTAMPTZ                                       NOT NULL,
        "paid_at"             TIMESTAMPTZ,
        "failure_reason"      text,
        "retry_count"         integer                                           NOT NULL DEFAULT 0,
        "metadata"            jsonb,
        "created_by"          character varying(255),
        "updated_by"          character varying(255),
        "created_at"          TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "deleted_at"          TIMESTAMPTZ,
        CONSTRAINT "PK_subscription_payments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_subscription_payments_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_subscription_payments_subscription_billing_cycle"
          UNIQUE ("subscription_id", "billing_cycle_ref"),
        CONSTRAINT "FK_subscription_payments_subscription_id"
          FOREIGN KEY ("subscription_id") REFERENCES "user_product_subscriptions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_subscription_payments_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_payments_subscription_id" ON "subscription_payments" ("subscription_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_payments_status" ON "subscription_payments" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscription_payments_billing_cycle_ref" ON "subscription_payments" ("billing_cycle_ref")`,
    );

    await queryRunner.query(`
      CREATE TABLE "membership_plans" (
        "id"                  uuid                                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"              character varying(16)                             NOT NULL,
        "name"                character varying(255)                            NOT NULL,
        "description"         text,
        "price"               numeric(12,2)                                     NOT NULL,
        "currency"            character varying(5)                              NOT NULL DEFAULT 'INR',
        "billing_cycle"       "public"."membership_billing_cycle_enum"          NOT NULL,
        "validity_days"       integer                                           NOT NULL,
        "renewal_enabled"     boolean                                           NOT NULL DEFAULT true,
        "grace_period_days"   integer                                           NOT NULL DEFAULT 7,
        "status"              "public"."membership_plan_status_enum"            NOT NULL DEFAULT 'ACTIVE',
        "sort_order"          integer                                           NOT NULL DEFAULT 0,
        "renewal_method"      "public"."subscription_renewal_method_enum"       NOT NULL DEFAULT 'PAYMENT_LINK',
        "created_by"          character varying(255),
        "updated_by"          character varying(255),
        "created_at"          TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "deleted_at"          TIMESTAMPTZ,
        CONSTRAINT "PK_membership_plans" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_membership_plans_ref_id" UNIQUE ("ref_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "membership_benefits" (
        "id"                  uuid                                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"              character varying(16)                             NOT NULL,
        "membership_plan_id"  uuid                                              NOT NULL,
        "benefit_type"        "public"."membership_benefit_type_enum"           NOT NULL,
        "value_type"          "public"."membership_benefit_value_type_enum"     NOT NULL,
        "value"               numeric(12,2)                                     DEFAULT 0,
        "metadata"            jsonb,
        "status"              "public"."membership_plan_status_enum"            NOT NULL DEFAULT 'ACTIVE',
        "sort_order"          integer                                           NOT NULL DEFAULT 0,
        "created_by"          character varying(255),
        "updated_by"          character varying(255),
        "created_at"          TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "deleted_at"          TIMESTAMPTZ,
        CONSTRAINT "PK_membership_benefits" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_membership_benefits_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_membership_benefits_membership_plan_id"
          FOREIGN KEY ("membership_plan_id") REFERENCES "membership_plans"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_membership_benefits_membership_plan_id" ON "membership_benefits" ("membership_plan_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "user_memberships" (
        "id"                        uuid                                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"                    character varying(16)                             NOT NULL,
        "user_id"                   uuid                                              NOT NULL,
        "membership_plan_id"        uuid                                              NOT NULL,
        "status"                    "public"."membership_status_enum"                 NOT NULL,
        "start_date"                TIMESTAMPTZ,
        "end_date"                  TIMESTAMPTZ,
        "next_billing_date"         TIMESTAMPTZ,
        "renewal_method"            "public"."subscription_renewal_method_enum"       NOT NULL,
        "payment_gateway"           character varying(50),
        "gateway_customer_id"       character varying(255),
        "gateway_subscription_id"   character varying(255),
        "gateway_mandate_id"        character varying(255),
        "cancellation_date"         TIMESTAMPTZ,
        "cancellation_reason"       text,
        "paused_at"                 TIMESTAMPTZ,
        "terms_accepted_at"         TIMESTAMPTZ,
        "created_by"                character varying(255),
        "updated_by"                character varying(255),
        "created_at"                TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "updated_at"                TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "deleted_at"                TIMESTAMPTZ,
        CONSTRAINT "PK_user_memberships" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_memberships_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_user_memberships_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_memberships_membership_plan_id"
          FOREIGN KEY ("membership_plan_id") REFERENCES "membership_plans"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_user_memberships_user_id" ON "user_memberships" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_memberships_membership_plan_id" ON "user_memberships" ("membership_plan_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_memberships_status" ON "user_memberships" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_memberships_next_billing_date" ON "user_memberships" ("next_billing_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_memberships_end_date" ON "user_memberships" ("end_date")`,
    );

    await queryRunner.query(`
      CREATE TABLE "membership_payments" (
        "id"                  uuid                                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"              character varying(16)                             NOT NULL,
        "user_membership_id"  uuid                                              NOT NULL,
        "user_id"             uuid                                              NOT NULL,
        "membership_plan_id"  uuid                                              NOT NULL,
        "amount"              numeric(12,2)                                     NOT NULL,
        "currency"            character varying(5)                              NOT NULL DEFAULT 'INR',
        "billing_cycle_ref"   character varying(64)                             NOT NULL,
        "payment_gateway"     character varying(50),
        "gateway_order_id"    character varying(255),
        "gateway_payment_id"  character varying(255),
        "payment_link"        character varying(500),
        "status"              "public"."membership_payment_status_enum"         NOT NULL,
        "billing_date"        TIMESTAMPTZ                                       NOT NULL,
        "paid_at"             TIMESTAMPTZ,
        "failure_reason"      text,
        "retry_count"         integer                                           NOT NULL DEFAULT 0,
        "metadata"            jsonb,
        "created_by"          character varying(255),
        "updated_by"          character varying(255),
        "created_at"          TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "deleted_at"          TIMESTAMPTZ,
        CONSTRAINT "PK_membership_payments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_membership_payments_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_membership_payments_membership_billing_cycle"
          UNIQUE ("user_membership_id", "billing_cycle_ref"),
        CONSTRAINT "FK_membership_payments_user_membership_id"
          FOREIGN KEY ("user_membership_id") REFERENCES "user_memberships"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_membership_payments_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_membership_payments_membership_plan_id"
          FOREIGN KEY ("membership_plan_id") REFERENCES "membership_plans"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_membership_payments_user_membership_id" ON "membership_payments" ("user_membership_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_membership_payments_user_id" ON "membership_payments" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_membership_payments_membership_plan_id" ON "membership_payments" ("membership_plan_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_membership_payments_status" ON "membership_payments" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_membership_payments_billing_cycle_ref" ON "membership_payments" ("billing_cycle_ref")`,
    );

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "subscription_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD CONSTRAINT "FK_orders_subscription_id"
      FOREIGN KEY ("subscription_id") REFERENCES "user_product_subscriptions"("id")
      ON DELETE SET NULL
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_orders_subscription_id" ON "orders" ("subscription_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_subscription_id"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "FK_orders_subscription_id"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "subscription_id"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_membership_payments_billing_cycle_ref"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_membership_payments_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_membership_payments_membership_plan_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_membership_payments_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_membership_payments_user_membership_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "membership_payments"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_memberships_end_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_memberships_next_billing_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_memberships_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_memberships_membership_plan_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_memberships_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_memberships"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_membership_benefits_membership_plan_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "membership_benefits"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "membership_plans"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_subscription_payments_billing_cycle_ref"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_subscription_payments_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_subscription_payments_subscription_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscription_payments"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_product_subscriptions_next_billing_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_product_subscriptions_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_product_subscriptions_product_variant_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_product_subscriptions_product_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_product_subscriptions_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_product_subscriptions"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_subscription_configs_enabled"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_subscription_configs_product_variant_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_subscription_configs_product_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_subscription_configs"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."membership_payment_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."membership_benefit_value_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."membership_benefit_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."membership_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."membership_plan_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."membership_billing_cycle_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."subscription_payment_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."subscription_missed_payment_action_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."subscription_renewal_method_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."subscription_discount_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."product_subscription_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."product_subscription_frequency_enum"`);
  }
}
