import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditPostgresRowCapture1786033000000 implements MigrationInterface {
  name = 'AuditPostgresRowCapture1786033000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "audit_log_changes" ALTER COLUMN "audit_log_id" DROP NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "audit_log_changes" ADD COLUMN IF NOT EXISTS "request_id" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log_changes" ADD COLUMN IF NOT EXISTS "operation" character varying(16)`,
    );
    await queryRunner.query(`ALTER TABLE "audit_log_changes" ADD COLUMN IF NOT EXISTS "record_key" jsonb`);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_log_changes_request_id_pending"
      ON "audit_log_changes" ("request_id")
      WHERE "audit_log_id" IS NULL AND "request_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION cureka_audit_capture_row() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        capture_id text;
        previous jsonb;
        nxt jsonb;
        rec_id uuid;
        rec_key jsonb;
        col text;
        skip_cols text[] := ARRAY[
          'created_at','updated_at','deleted_at','created_by','updated_by',
          'password','password_hash','hashed_password','passwd',
          'otp','pin','secret','token','access_token','refresh_token',
          'session_token','remember_token','authorization','api_key','apikey'
        ];
      BEGIN
        capture_id := nullif(current_setting('app.audit_request_id', true), '');
        IF capture_id IS NULL THEN
          RETURN COALESCE(NEW, OLD);
        END IF;

        IF TG_OP = 'DELETE' THEN
          previous := to_jsonb(OLD);
          nxt := '{}'::jsonb;
        ELSIF TG_OP = 'INSERT' THEN
          previous := '{}'::jsonb;
          nxt := to_jsonb(NEW);
        ELSE
          previous := to_jsonb(OLD);
          nxt := to_jsonb(NEW);
        END IF;

        rec_key := COALESCE(nxt, previous);
        BEGIN
          IF rec_key ? 'id' AND (rec_key->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            rec_id := (rec_key->>'id')::uuid;
          END IF;
        EXCEPTION WHEN others THEN
          rec_id := NULL;
        END;

        FOR col IN SELECT jsonb_object_keys(previous || nxt)
        LOOP
          IF col = ANY(skip_cols) THEN
            CONTINUE;
          END IF;
          IF lower(col) LIKE '%password%' OR lower(col) LIKE '%token%' OR lower(col) LIKE '%secret%' THEN
            CONTINUE;
          END IF;
          IF (previous -> col) IS NOT DISTINCT FROM (nxt -> col) THEN
            CONTINUE;
          END IF;
          INSERT INTO audit_log_changes (
            audit_log_id, request_id, table_name, record_id, record_key, column_name, field,
            change_type, operation, old_value, new_value
          ) VALUES (
            NULL,
            left(capture_id, 64),
            TG_TABLE_NAME,
            rec_id,
            jsonb_build_object('id', rec_key->'id'),
            left(col, 64),
            left(col, 64),
            CASE TG_OP
              WHEN 'INSERT' THEN 'created'
              WHEN 'DELETE' THEN 'deleted'
              ELSE 'updated'
            END,
            TG_OP,
            CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE previous -> col END,
            CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE nxt -> col END
          );
        END LOOP;

        RETURN COALESCE(NEW, OLD);
      END;
      $$
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        r record;
      BEGIN
        FOR r IN
          SELECT tablename
          FROM pg_tables
          WHERE schemaname = 'public'
            AND tablename NOT IN (
              'audit_logs', 'audit_log_changes', 'audit_outbox', 'migrations', 'typeorm_metadata'
            )
        LOOP
          EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_cureka_audit_capture ON %I',
            r.tablename
          );
          EXECUTE format(
            'CREATE TRIGGER trg_cureka_audit_capture
             AFTER INSERT OR UPDATE OR DELETE ON %I
             FOR EACH ROW EXECUTE PROCEDURE cureka_audit_capture_row()',
            r.tablename
          );
        END LOOP;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE r record;
      BEGIN
        FOR r IN
          SELECT event_object_table AS tablename
          FROM information_schema.triggers
          WHERE trigger_schema = 'public' AND trigger_name = 'trg_cureka_audit_capture'
        LOOP
          EXECUTE format('DROP TRIGGER IF EXISTS trg_cureka_audit_capture ON %I', r.tablename);
        END LOOP;
      END $$
    `);
    await queryRunner.query(`DROP FUNCTION IF EXISTS cureka_audit_capture_row()`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_log_changes_request_id_pending"`);
    await queryRunner.query(`ALTER TABLE "audit_log_changes" DROP COLUMN IF EXISTS "record_key"`);
    await queryRunner.query(`ALTER TABLE "audit_log_changes" DROP COLUMN IF EXISTS "operation"`);
    await queryRunner.query(`ALTER TABLE "audit_log_changes" DROP COLUMN IF EXISTS "request_id"`);
    await queryRunner.query(
      `DELETE FROM "audit_log_changes" WHERE "audit_log_id" IS NULL`,
    );
    await queryRunner.query(`ALTER TABLE "audit_log_changes" ALTER COLUMN "audit_log_id" SET NOT NULL`);
  }
}
