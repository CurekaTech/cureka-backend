import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditLogPayloadAndChanges1786032000000 implements MigrationInterface {
  name = 'AuditLogPayloadAndChanges1786032000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "batch_id" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "capture_status" character varying(16)`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "request_context" jsonb`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "request_payload" jsonb`);
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "changed_fields_count" integer NOT NULL DEFAULT 0`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_log_changes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "audit_log_id" uuid NOT NULL,
        "table_name" character varying(64) NOT NULL,
        "record_id" uuid,
        "column_name" character varying(64) NOT NULL,
        "field" character varying(64) NOT NULL,
        "change_type" character varying(16) NOT NULL,
        "old_value" jsonb,
        "new_value" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_log_changes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_audit_log_changes_audit_log" FOREIGN KEY ("audit_log_id")
          REFERENCES "audit_logs"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_log_changes_audit_log_id"
      ON "audit_log_changes" ("audit_log_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_batch_id"
      ON "audit_logs" ("batch_id")
      WHERE "batch_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_batch_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_log_changes_audit_log_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_log_changes"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "changed_fields_count"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "request_payload"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "request_context"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "capture_status"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "batch_id"`);
  }
}
