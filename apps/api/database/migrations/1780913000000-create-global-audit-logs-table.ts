import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGlobalAuditLogsTable1780913000000 implements MigrationInterface {
  name = 'CreateGlobalAuditLogsTable1780913000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "entity_type" character varying(64) NOT NULL,
        "entity_id" uuid NOT NULL,
        "entity_ref_id" character varying(64),
        "action" character varying(64) NOT NULL,
        "performed_by" character varying(255) NOT NULL,
        "details" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_entity_type_entity_id"
      ON "audit_logs" ("entity_type", "entity_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_entity_type_entity_ref_id"
      ON "audit_logs" ("entity_type", "entity_ref_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_created_at"
      ON "audit_logs" ("created_at" DESC)
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'blog_audit_logs'
        ) THEN
          INSERT INTO "audit_logs" (
            "id",
            "entity_type",
            "entity_id",
            "entity_ref_id",
            "action",
            "performed_by",
            "details",
            "created_at"
          )
          SELECT
            bal."id",
            'blog_post',
            bal."blog_post_id",
            bp."ref_id",
            bal."action"::text,
            bal."performed_by",
            bal."details",
            bal."created_at"
          FROM "blog_audit_logs" bal
          LEFT JOIN "blog_posts" bp ON bp."id" = bal."blog_post_id"
          WHERE NOT EXISTS (
            SELECT 1 FROM "audit_logs" al WHERE al."id" = bal."id"
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'support_ticket_audit_logs'
        ) THEN
          INSERT INTO "audit_logs" (
            "id",
            "entity_type",
            "entity_id",
            "entity_ref_id",
            "action",
            "performed_by",
            "details",
            "created_at"
          )
          SELECT
            sal."id",
            'support_ticket',
            sal."ticket_id",
            st."ref_id",
            sal."action"::text,
            sal."performed_by",
            sal."details",
            sal."created_at"
          FROM "support_ticket_audit_logs" sal
          LEFT JOIN "support_tickets" st ON st."id" = sal."ticket_id"
          WHERE NOT EXISTS (
            SELECT 1 FROM "audit_logs" al WHERE al."id" = sal."id"
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_blog_audit_logs_blog_post_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "blog_audit_logs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "blog_audit_action_enum"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_ticket_audit_logs_ticket_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "support_ticket_audit_logs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "support_ticket_audit_action_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "support_ticket_audit_action_enum" AS ENUM (
        'created',
        'status_changed',
        'assigned',
        'priority_changed',
        'message_added',
        'internal_note_added'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "support_ticket_audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ticket_id" uuid NOT NULL,
        "action" "support_ticket_audit_action_enum" NOT NULL,
        "performed_by" character varying(255) NOT NULL,
        "details" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_support_ticket_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_support_ticket_audit_logs_ticket" FOREIGN KEY ("ticket_id")
          REFERENCES "support_tickets"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_support_ticket_audit_logs_ticket_id"
      ON "support_ticket_audit_logs" ("ticket_id")
    `);

    await queryRunner.query(`
      CREATE TYPE "blog_audit_action_enum" AS ENUM (
        'created',
        'updated',
        'published',
        'unpublished',
        'scheduled',
        'status_changed',
        'featured',
        'unfeatured',
        'trending',
        'untrending',
        'deleted'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "blog_audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "blog_post_id" uuid NOT NULL,
        "action" "blog_audit_action_enum" NOT NULL,
        "performed_by" character varying(255) NOT NULL,
        "details" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_blog_audit_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_blog_audit_logs_blog_post_id"
      ON "blog_audit_logs" ("blog_post_id")
    `);

    await queryRunner.query(`
      INSERT INTO "support_ticket_audit_logs" (
        "id", "ticket_id", "action", "performed_by", "details", "created_at"
      )
      SELECT
        "id",
        "entity_id",
        "action"::"support_ticket_audit_action_enum",
        "performed_by",
        "details",
        "created_at"
      FROM "audit_logs"
      WHERE "entity_type" = 'support_ticket'
    `);

    await queryRunner.query(`
      INSERT INTO "blog_audit_logs" (
        "id", "blog_post_id", "action", "performed_by", "details", "created_at"
      )
      SELECT
        "id",
        "entity_id",
        "action"::"blog_audit_action_enum",
        "performed_by",
        "details",
        "created_at"
      FROM "audit_logs"
      WHERE "entity_type" = 'blog_post'
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_entity_type_entity_ref_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_entity_type_entity_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
  }
}
