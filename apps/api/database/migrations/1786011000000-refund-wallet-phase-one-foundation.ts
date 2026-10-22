import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefundWalletPhaseOneFoundation1786011000000 implements MigrationInterface {
  name = 'RefundWalletPhaseOneFoundation1786011000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."refund_wallet_account_status_enum"
      AS ENUM ('ACTIVE', 'FROZEN', 'DISABLED')
    `);
    await queryRunner.query(`
      ALTER TABLE "refund_wallet_accounts"
        ADD COLUMN "reserved_balance_paise" bigint NOT NULL DEFAULT 0,
        ADD COLUMN "status" "public"."refund_wallet_account_status_enum" NOT NULL DEFAULT 'ACTIVE'
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."refund_wallet_reservation_status_enum"
      AS ENUM ('PENDING', 'CONSUMED', 'RELEASED')
    `);
    await queryRunner.query(`
      CREATE TABLE "refund_wallet_reservations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "account_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "payment_request_id" uuid,
        "order_id" uuid,
        "amount_paise" bigint NOT NULL,
        "status" "public"."refund_wallet_reservation_status_enum" NOT NULL DEFAULT 'PENDING',
        "idempotency_key" character varying(150) NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "settled_at" TIMESTAMPTZ,
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_refund_wallet_reservations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_refund_wallet_reservations_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_refund_wallet_reservations_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "CHK_refund_wallet_reservations_amount_positive" CHECK ("amount_paise" > 0),
        CONSTRAINT "FK_refund_wallet_reservations_account_id" FOREIGN KEY ("account_id")
          REFERENCES "refund_wallet_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_refund_wallet_reservations_customer_id" FOREIGN KEY ("customer_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_refund_wallet_reservations_payment_request_id" FOREIGN KEY ("payment_request_id")
          REFERENCES "payment_requests"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_refund_wallet_reservations_order_id" FOREIGN KEY ("order_id")
          REFERENCES "orders"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_refund_wallet_reservations_account_status" ON "refund_wallet_reservations" ("account_id", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_refund_wallet_reservations_customer_id" ON "refund_wallet_reservations" ("customer_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_refund_wallet_reservations_payment_request_id" ON "refund_wallet_reservations" ("payment_request_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_refund_wallet_reservations_order_id" ON "refund_wallet_reservations" ("order_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_refund_wallet_reservations_status" ON "refund_wallet_reservations" ("status")`);
    await queryRunner.query(`ALTER TYPE "public"."refund_wallet_ledger_type_enum" ADD VALUE IF NOT EXISTS 'CHECKOUT_DEBIT'`);
    await queryRunner.query(`ALTER TABLE "refund_wallet_ledger" ADD COLUMN "payment_request_id" uuid, ADD COLUMN "order_id" uuid, ADD COLUMN "reservation_id" uuid`);
    await queryRunner.query(`ALTER TABLE "refund_wallet_ledger" ADD CONSTRAINT "FK_refund_wallet_ledger_payment_request_id" FOREIGN KEY ("payment_request_id") REFERENCES "payment_requests"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "refund_wallet_ledger" ADD CONSTRAINT "FK_refund_wallet_ledger_order_id" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "refund_wallet_ledger" ADD CONSTRAINT "FK_refund_wallet_ledger_reservation_id" FOREIGN KEY ("reservation_id") REFERENCES "refund_wallet_reservations"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE INDEX "IDX_refund_wallet_ledger_payment_request_id" ON "refund_wallet_ledger" ("payment_request_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_refund_wallet_ledger_order_id" ON "refund_wallet_ledger" ("order_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_refund_wallet_ledger_reservation_id" ON "refund_wallet_ledger" ("reservation_id") WHERE "reservation_id" IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE "payment_requests" ADD COLUMN "wallet_amount_paise" bigint NOT NULL DEFAULT 0, ADD COLUMN "eligible_total_paise" bigint`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN "wallet_amount_paise" bigint NOT NULL DEFAULT 0, ADD COLUMN "gateway_amount_paise" bigint NOT NULL DEFAULT 0, ADD COLUMN "payment_request_id" uuid`);
    await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_payment_request_id" FOREIGN KEY ("payment_request_id") REFERENCES "payment_requests"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_orders_payment_request_id" ON "orders" ("payment_request_id") WHERE "payment_request_id" IS NOT NULL`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      'Wallet foundation migration is intentionally irreversible after deployment; disable the feature and preserve reservation/ledger records.',
    );
  }
}
