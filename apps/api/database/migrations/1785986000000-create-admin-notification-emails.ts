import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminNotificationEmails1785986000000 implements MigrationInterface {
  name = 'CreateAdminNotificationEmails1785986000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "admin_notification_email_type_enum" AS ENUM ('product_oos');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_notification_emails" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id" character varying(16) NOT NULL,
        "email" character varying(255) NOT NULL,
        "type" "admin_notification_email_type_enum" NOT NULL DEFAULT 'product_oos',
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_by" character varying(255),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_by" character varying(255),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_admin_notification_emails" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_admin_notification_emails_ref_id" UNIQUE ("ref_id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_admin_notification_emails_email_type_active"
      ON "admin_notification_emails" ("email", "type")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_admin_notification_emails_type"
      ON "admin_notification_emails" ("type")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_admin_notification_emails_is_active"
      ON "admin_notification_emails" ("is_active")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_admin_notification_emails_is_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_admin_notification_emails_type"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_admin_notification_emails_email_type_active"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_notification_emails"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "admin_notification_email_type_enum"`);
  }
}
