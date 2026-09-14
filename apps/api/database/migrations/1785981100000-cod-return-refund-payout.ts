import { MigrationInterface, QueryRunner } from 'typeorm';

interface PermissionSeed {
  refId: string;
  name: string;
  code: string;
  module: string;
  action: string;
}

const permissions: PermissionSeed[] = [
  {
    refId: 'PER00000354',
    name: 'View COD Refund Payouts',
    code: 'refund_payouts.read',
    module: 'refund_payouts',
    action: 'read',
  },
  {
    refId: 'PER00000355',
    name: 'Update COD Refund Payouts',
    code: 'refund_payouts.update',
    module: 'refund_payouts',
    action: 'update',
  },
  {
    refId: 'PER00000356',
    name: 'Process COD Refund Payouts',
    code: 'refund_payouts.status',
    module: 'refund_payouts',
    action: 'status',
  },
];

export class CodReturnRefundPayout1785981100000 implements MigrationInterface {
  name = 'CodReturnRefundPayout1785981100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."return_requests_refund_method_enum" AS ENUM ('BANK_ACCOUNT', 'WALLET')
    `);
    await queryRunner.query(`
      ALTER TABLE "return_requests"
        ADD COLUMN IF NOT EXISTS "refund_method" "public"."return_requests_refund_method_enum",
        ADD COLUMN IF NOT EXISTS "bank_account_holder_name" character varying(150),
        ADD COLUMN IF NOT EXISTS "bank_account_number_encrypted" text,
        ADD COLUMN IF NOT EXISTS "bank_account_number_last4" character varying(4),
        ADD COLUMN IF NOT EXISTS "bank_ifsc" character varying(11),
        ADD COLUMN IF NOT EXISTS "bank_name" character varying(150),
        ADD COLUMN IF NOT EXISTS "bank_account_type" character varying(20),
        ADD COLUMN IF NOT EXISTS "bank_details_submitted_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "bank_details_locked" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "refund_requests"
        ADD COLUMN IF NOT EXISTS "amount_allocation" jsonb
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."cod_refund_payouts_refund_method_enum" AS ENUM ('BANK_ACCOUNT', 'WALLET')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."cod_refund_payouts_status_enum" AS ENUM (
        'PENDING_DETAILS',
        'DETAILS_SUBMITTED',
        'UNDER_VERIFICATION',
        'READY_FOR_PAYOUT',
        'PROCESSING',
        'PAID',
        'FAILED',
        'ON_HOLD',
        'CANCELLED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."refund_wallet_ledger_direction_enum" AS ENUM ('CREDIT', 'DEBIT')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."refund_wallet_ledger_type_enum" AS ENUM ('COD_REFUND', 'ORIGINAL_WALLET_REFUND')
    `);

    await queryRunner.query(`
      CREATE TABLE "cod_refund_payouts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "refund_request_id" uuid NOT NULL,
        "return_request_id" uuid,
        "order_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "currency" character varying(5) NOT NULL DEFAULT 'INR',
        "refund_method" "public"."cod_refund_payouts_refund_method_enum" NOT NULL,
        "status" "public"."cod_refund_payouts_status_enum" NOT NULL DEFAULT 'PENDING_DETAILS',
        "account_holder_name" character varying(150),
        "masked_account_number" character varying(20),
        "account_number_last4" character varying(4),
        "ifsc" character varying(11),
        "bank_name" character varying(150),
        "account_type" character varying(20),
        "processed_by" character varying(64),
        "processed_at" TIMESTAMPTZ,
        "verified_by" character varying(64),
        "verified_at" TIMESTAMPTZ,
        "utr" character varying(64),
        "transfer_date" date,
        "payment_proof_path" character varying(500),
        "failure_reason" text,
        "internal_notes" text,
        "customer_visible_notes" text,
        "wallet_ledger_id" uuid,
        "provider_code" character varying(40) NOT NULL DEFAULT 'MANUAL',
        "version" integer NOT NULL DEFAULT 1,
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_cod_refund_payouts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cod_refund_payouts_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_cod_refund_payouts_refund_request_id" UNIQUE ("refund_request_id"),
        CONSTRAINT "CHK_cod_refund_payouts_amount_positive" CHECK ("amount" > 0),
        CONSTRAINT "FK_cod_refund_payouts_refund_request_id" FOREIGN KEY ("refund_request_id")
          REFERENCES "refund_requests"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cod_refund_payouts_return_request_id" FOREIGN KEY ("return_request_id")
          REFERENCES "return_requests"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_cod_refund_payouts_order_id" FOREIGN KEY ("order_id")
          REFERENCES "orders"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cod_refund_payouts_customer_id" FOREIGN KEY ("customer_id")
          REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_cod_refund_payouts_return_request_id" ON "cod_refund_payouts" ("return_request_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cod_refund_payouts_order_id" ON "cod_refund_payouts" ("order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cod_refund_payouts_customer_id" ON "cod_refund_payouts" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cod_refund_payouts_status" ON "cod_refund_payouts" ("status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "refund_wallet_accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "customer_id" uuid NOT NULL,
        "available_balance" numeric(12,2) NOT NULL DEFAULT 0,
        "currency" character varying(5) NOT NULL DEFAULT 'INR',
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_refund_wallet_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_refund_wallet_accounts_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_refund_wallet_accounts_customer_id" UNIQUE ("customer_id"),
        CONSTRAINT "FK_refund_wallet_accounts_customer_id" FOREIGN KEY ("customer_id")
          REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "refund_wallet_ledger" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "account_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "direction" "public"."refund_wallet_ledger_direction_enum" NOT NULL,
        "type" "public"."refund_wallet_ledger_type_enum" NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "balance_after" numeric(12,2) NOT NULL,
        "currency" character varying(5) NOT NULL DEFAULT 'INR',
        "payout_id" uuid,
        "refund_request_id" uuid,
        "return_request_id" uuid,
        "idempotency_key" character varying(120) NOT NULL,
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_refund_wallet_ledger" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_refund_wallet_ledger_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_refund_wallet_ledger_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "CHK_refund_wallet_ledger_amount_positive" CHECK ("amount" > 0),
        CONSTRAINT "FK_refund_wallet_ledger_account_id" FOREIGN KEY ("account_id")
          REFERENCES "refund_wallet_accounts"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_refund_wallet_ledger_payout_id"
      ON "refund_wallet_ledger" ("payout_id")
      WHERE "payout_id" IS NOT NULL
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_refund_wallet_ledger_account_id" ON "refund_wallet_ledger" ("account_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refund_wallet_ledger_customer_id" ON "refund_wallet_ledger" ("customer_id")`,
    );

    for (const permission of permissions) {
      await queryRunner.query(
        `
        INSERT INTO "permissions" ("ref_id", "code", "name", "module", "action", "status", "created_by")
        SELECT $1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::permissions_action_enum, 'active', 'system'
        WHERE NOT EXISTS (
          SELECT 1 FROM "permissions"
          WHERE (
            LOWER("code") = LOWER($2::varchar)
            OR "ref_id" = $1::varchar
          )
          AND "deleted_at" IS NULL
        )
      `,
        [permission.refId, permission.code, permission.name, permission.module, permission.action],
      );
    }

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id"
      FROM "roles" r
      JOIN "permissions" p
        ON p."code" IN (${permissions.map((permission) => `'${permission.code}'`).join(', ')})
      WHERE r."slug" IN ('super_admin', 'admin')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "permission_id" IN (
        SELECT "id" FROM "permissions"
        WHERE "code" IN (${permissions.map((permission) => `'${permission.code}'`).join(', ')})
      )
    `);
    await queryRunner.query(`
      DELETE FROM "permissions"
      WHERE "code" IN (${permissions.map((permission) => `'${permission.code}'`).join(', ')})
        AND "created_by" = 'system'
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "refund_wallet_ledger"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refund_wallet_accounts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cod_refund_payouts"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."refund_wallet_ledger_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."refund_wallet_ledger_direction_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."cod_refund_payouts_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."cod_refund_payouts_refund_method_enum"`);

    await queryRunner.query(`
      ALTER TABLE "refund_requests" DROP COLUMN IF EXISTS "amount_allocation"
    `);
    await queryRunner.query(`
      ALTER TABLE "return_requests"
        DROP COLUMN IF EXISTS "bank_details_locked",
        DROP COLUMN IF EXISTS "bank_details_submitted_at",
        DROP COLUMN IF EXISTS "bank_account_type",
        DROP COLUMN IF EXISTS "bank_name",
        DROP COLUMN IF EXISTS "bank_ifsc",
        DROP COLUMN IF EXISTS "bank_account_number_last4",
        DROP COLUMN IF EXISTS "bank_account_number_encrypted",
        DROP COLUMN IF EXISTS "bank_account_holder_name",
        DROP COLUMN IF EXISTS "refund_method"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."return_requests_refund_method_enum"`);
  }
}
