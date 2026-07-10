import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExpertTalkItemsTable1780906100000 implements MigrationInterface {
  name = 'CreateExpertTalkItemsTable1780906100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."expert_talk_items_content_type_enum" AS ENUM('talk', 'podcast')
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."expert_talk_items_status_enum" AS ENUM('active', 'inactive')
    `);

    await queryRunner.query(`
      CREATE TABLE "expert_talk_items" (
        "id"            uuid                                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"        character varying(11)                             NOT NULL,
        "title"         character varying(500)                            NOT NULL,
        "description"   text,
        "video_url"     character varying(2000)                           NOT NULL,
        "thumbnail"     jsonb,
        "content_type"  "public"."expert_talk_items_content_type_enum"    NOT NULL DEFAULT 'talk',
        "sort_order"    integer                                           NOT NULL DEFAULT 0,
        "status"        "public"."expert_talk_items_status_enum"          NOT NULL DEFAULT 'active',
        "created_by"    character varying(255),
        "updated_by"    character varying(255),
        "created_at"    TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "deleted_at"    TIMESTAMPTZ,
        CONSTRAINT "PK_expert_talk_items"        PRIMARY KEY ("id"),
        CONSTRAINT "UQ_expert_talk_items_ref_id" UNIQUE ("ref_id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_expert_talk_items_status" ON "expert_talk_items" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_expert_talk_items_status_sort" ON "expert_talk_items" ("status", "sort_order")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_expert_talk_items_status_sort"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_expert_talk_items_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "expert_talk_items"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."expert_talk_items_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."expert_talk_items_content_type_enum"`);
  }
}
