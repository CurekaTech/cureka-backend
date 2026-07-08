import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReasonMastersTable1780904000000 implements MigrationInterface {
  name = 'CreateReasonMastersTable1780904000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "reason_pickup_mode_enum" AS ENUM ('pickup_required', 'no_pickup_required');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reason_masters" (
        "id"                      uuid                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"                  character varying(11)             NOT NULL,
        "title"                   character varying(255)            NOT NULL,
        "code"                    character varying(100)            NOT NULL,
        "description"             text,
        "workflows"               jsonb                             NOT NULL DEFAULT '[]',
        "category_ref_ids"        jsonb                             NOT NULL DEFAULT '[]',
        "sku_refs"                jsonb                             NOT NULL DEFAULT '[]',
        "pickup_mode"             "reason_pickup_mode_enum"         NOT NULL DEFAULT 'pickup_required',
        "is_mandatory"            boolean                           NOT NULL DEFAULT true,
        "comments_required"       boolean                           NOT NULL DEFAULT false,
        "images_required"         boolean                           NOT NULL DEFAULT false,
        "video_required"          boolean                           NOT NULL DEFAULT false,
        "qc_required"             boolean                           NOT NULL DEFAULT false,
        "auto_approval_eligible"  boolean                           NOT NULL DEFAULT false,
        "sort_order"              integer                           NOT NULL DEFAULT 0,
        "status"                  "public"."brands_status_enum"     NOT NULL DEFAULT 'active',
        "created_by"              character varying(255),
        "updated_by"              character varying(255),
        "created_at"              TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "updated_at"              TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "deleted_at"              TIMESTAMPTZ,
        CONSTRAINT "PK_reason_masters" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_reason_masters_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_reason_masters_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reason_masters_title" ON "reason_masters" ("title")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reason_masters_code" ON "reason_masters" ("code")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reason_masters_status" ON "reason_masters" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reason_masters_sort_order" ON "reason_masters" ("sort_order")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reason_masters_sort_order"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reason_masters_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reason_masters_code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_reason_masters_title"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reason_masters"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "reason_pickup_mode_enum"`);
  }
}
