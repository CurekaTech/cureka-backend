import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSupportModuleTables1780903000000 implements MigrationInterface {
  name = 'CreateSupportModuleTables1780903000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."support_categories_type_enum" AS ENUM('article', 'faq', 'both')
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."support_content_status_enum" AS ENUM('active', 'inactive')
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."support_tickets_category_enum" AS ENUM(
        'order_issue', 'refund', 'product', 'delivery', 'consultation', 'others'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."support_tickets_status_enum" AS ENUM(
        'open', 'in_progress', 'resolved', 'closed'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."support_tickets_priority_enum" AS ENUM('low', 'medium', 'high')
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."ticket_messages_sender_type_enum" AS ENUM(
        'user', 'admin', 'system', 'internal_note'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."support_ticket_audit_action_enum" AS ENUM(
        'created', 'status_changed', 'assigned', 'priority_changed', 'message_added', 'internal_note_added'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "support_categories" (
        "id"          uuid                                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"      character varying(11)                             NOT NULL,
        "name"        character varying(150)                            NOT NULL,
        "slug"        character varying(180)                            NOT NULL,
        "type"        "public"."support_categories_type_enum"           NOT NULL DEFAULT 'both',
        "status"      "public"."support_content_status_enum"            NOT NULL DEFAULT 'active',
        "created_by"  character varying(255),
        "updated_by"  character varying(255),
        "created_at"  TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "deleted_at"  TIMESTAMPTZ,
        CONSTRAINT "PK_support_categories" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_support_categories_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_support_categories_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "support_articles" (
        "id"               uuid                                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"           character varying(11)                             NOT NULL,
        "title"            character varying(255)                            NOT NULL,
        "slug"             character varying(280)                            NOT NULL,
        "category_ref_id"  character varying(11)                             NOT NULL,
        "content"          text                                              NOT NULL,
        "featured_image"   jsonb,
        "status"           "public"."support_content_status_enum"            NOT NULL DEFAULT 'active',
        "views"            integer                                           NOT NULL DEFAULT 0,
        "created_by"       character varying(255),
        "updated_by"       character varying(255),
        "created_at"       TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMPTZ,
        CONSTRAINT "PK_support_articles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_support_articles_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_support_articles_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "support_faqs" (
        "id"               uuid                                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"           character varying(11)                             NOT NULL,
        "question"         character varying(500)                            NOT NULL,
        "answer"           text                                              NOT NULL,
        "category_ref_id"  character varying(11)                             NOT NULL,
        "sort_order"       integer                                           NOT NULL DEFAULT 0,
        "status"           "public"."support_content_status_enum"            NOT NULL DEFAULT 'active',
        "created_by"       character varying(255),
        "updated_by"       character varying(255),
        "created_at"       TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMPTZ,
        CONSTRAINT "PK_support_faqs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_support_faqs_ref_id" UNIQUE ("ref_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "support_tickets" (
        "id"             uuid                                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"         character varying(11)                             NOT NULL,
        "ticket_number"  character varying(20)                             NOT NULL,
        "user_id"        uuid,
        "guest_name"     character varying(150),
        "guest_email"    character varying(255),
        "guest_mobile"   character varying(20),
        "category"       "public"."support_tickets_category_enum"          NOT NULL,
        "subject"        character varying(255)                            NOT NULL,
        "description"    text                                              NOT NULL,
        "status"         "public"."support_tickets_status_enum"            NOT NULL DEFAULT 'open',
        "priority"       "public"."support_tickets_priority_enum"          NOT NULL DEFAULT 'medium',
        "order_id"       character varying(50),
        "assigned_to"    character varying(255),
        "created_by"     character varying(255),
        "updated_by"     character varying(255),
        "created_at"     TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "deleted_at"     TIMESTAMPTZ,
        CONSTRAINT "PK_support_tickets" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_support_tickets_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_support_tickets_ticket_number" UNIQUE ("ticket_number")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "ticket_messages" (
        "id"              uuid                                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"          character varying(11)                             NOT NULL,
        "ticket_id"       uuid                                              NOT NULL,
        "sender_type"     "public"."ticket_messages_sender_type_enum"       NOT NULL,
        "sender_id"       character varying(255),
        "message"         text                                              NOT NULL,
        "attachment_url"  jsonb,
        "created_by"      character varying(255),
        "updated_by"      character varying(255),
        "created_at"      TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "deleted_at"      TIMESTAMPTZ,
        CONSTRAINT "PK_ticket_messages" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_ticket_messages_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_ticket_messages_ticket" FOREIGN KEY ("ticket_id")
          REFERENCES "support_tickets"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "support_ticket_audit_logs" (
        "id"            uuid                                              NOT NULL DEFAULT uuid_generate_v4(),
        "ticket_id"     uuid                                              NOT NULL,
        "action"        "public"."support_ticket_audit_action_enum"       NOT NULL,
        "performed_by"  character varying(255)                            NOT NULL,
        "details"       jsonb,
        "created_at"    TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        CONSTRAINT "PK_support_ticket_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_support_ticket_audit_logs_ticket" FOREIGN KEY ("ticket_id")
          REFERENCES "support_tickets"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "support_notifications" (
        "id"             uuid                                              NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"        uuid                                              NOT NULL,
        "ticket_ref_id"  character varying(11)                             NOT NULL,
        "title"          character varying(255)                            NOT NULL,
        "message"        text                                              NOT NULL,
        "is_read"        boolean                                           NOT NULL DEFAULT false,
        "created_at"     TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        CONSTRAINT "PK_support_notifications" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_support_categories_status" ON "support_categories" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_support_articles_category_ref_id" ON "support_articles" ("category_ref_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_support_articles_status" ON "support_articles" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_support_faqs_category_ref_id" ON "support_faqs" ("category_ref_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_support_faqs_status" ON "support_faqs" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_support_tickets_user_id" ON "support_tickets" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_support_tickets_category" ON "support_tickets" ("category")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_support_tickets_status" ON "support_tickets" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_support_tickets_status_created" ON "support_tickets" ("status", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ticket_messages_ticket_id" ON "ticket_messages" ("ticket_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_support_ticket_audit_logs_ticket_id" ON "support_ticket_audit_logs" ("ticket_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_support_notifications_user_id" ON "support_notifications" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_support_notifications_ticket_ref_id" ON "support_notifications" ("ticket_ref_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_notifications_ticket_ref_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_notifications_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_ticket_audit_logs_ticket_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ticket_messages_ticket_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_tickets_status_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_tickets_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_tickets_category"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_tickets_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_faqs_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_faqs_category_ref_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_articles_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_articles_category_ref_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_categories_status"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "support_notifications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "support_ticket_audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ticket_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "support_tickets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "support_faqs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "support_articles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "support_categories"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."support_ticket_audit_action_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."ticket_messages_sender_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."support_tickets_priority_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."support_tickets_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."support_tickets_category_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."support_content_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."support_categories_type_enum"`);
  }
}
