import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Durable idempotency for product-subscription renewal reminder emails
 * (e.g. 5 days before nextBillingDate) so multi-instance schedulers and
 * retries do not send duplicate emails for the same cycle + offset.
 */
export class CreateSubscriptionReminderLogs1786024000000 implements MigrationInterface {
  name = 'CreateSubscriptionReminderLogs1786024000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "subscription_reminder_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "created_by" character varying,
        "updated_by" character varying,
        "deleted_by" character varying,
        "subscription_id" uuid NOT NULL,
        "billing_cycle_ref" character varying(64) NOT NULL,
        "days_before" integer NOT NULL,
        "channel" character varying(32) NOT NULL DEFAULT 'email',
        "payment_id" uuid,
        "sent_at" TIMESTAMPTZ NOT NULL,
        CONSTRAINT "PK_subscription_reminder_logs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_subscription_reminder_logs_ref_id" UNIQUE ("ref_id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_subscription_reminder_logs_cycle_offset_channel"
      ON "subscription_reminder_logs" ("subscription_id", "billing_cycle_ref", "days_before", "channel")
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_subscription_reminder_logs_subscription_id"
      ON "subscription_reminder_logs" ("subscription_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "subscription_reminder_logs"`);
  }
}
