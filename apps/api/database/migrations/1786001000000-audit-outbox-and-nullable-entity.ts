import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditOutboxAndNullableEntity1786001000000 implements MigrationInterface {
  name = 'AuditOutboxAndNullableEntity1786001000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "entity_id" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actor_type" character varying(16)`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actor_id" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "ip_address" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "request_id" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "idempotency_key" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "reliability" character varying(16)`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_audit_logs_idempotency_key"
      ON "audit_logs" ("idempotency_key")
      WHERE "idempotency_key" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_outbox" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "idempotency_key" character varying(255) NOT NULL,
        "payload" jsonb NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'pending',
        "attempts" integer NOT NULL DEFAULT 0,
        "last_error" text,
        "next_attempt_at" TIMESTAMP WITH TIME ZONE,
        "locked_at" TIMESTAMP WITH TIME ZONE,
        "claim_token" character varying(64),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "published_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_audit_outbox" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_audit_outbox_idempotency_key" UNIQUE ("idempotency_key")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_outbox_claim"
      ON "audit_outbox" ("status", "next_attempt_at", "locked_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_outbox"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_idempotency_key"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "reliability"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "idempotency_key"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "request_id"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "ip_address"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "actor_id"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "actor_type"`);
    await queryRunner.query(`DELETE FROM "audit_logs" WHERE "entity_id" IS NULL`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ALTER COLUMN "entity_id" SET NOT NULL`);
  }
}
