import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateImagePipelineTables1785985000000 implements MigrationInterface {
  name = 'CreateImagePipelineTables1785985000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "image_assets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "source_bucket" character varying(255) NOT NULL,
        "source_key" character varying(1024) NOT NULL,
        "source_hash" character varying(64),
        "source_width" integer,
        "source_height" integer,
        "source_mime" character varying(100),
        "source_bytes" integer,
        "pipeline_version" character varying(32) NOT NULL,
        "status" character varying(32) NOT NULL,
        "process_token" character varying(64) NOT NULL,
        "variants" jsonb NOT NULL DEFAULT '[]',
        "error_code" character varying(64),
        "error_message" character varying(300),
        "attempt_count" integer NOT NULL DEFAULT 0,
        "processed_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_image_assets" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_image_assets_source"
      ON "image_assets" ("source_bucket", "source_key")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_image_assets_status_updated"
      ON "image_assets" ("status", "updated_at")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "image_pipeline_checkpoints" (
        "id" character varying(128) NOT NULL,
        "cursor_id" character varying(64),
        "entity_type" character varying(64),
        "stats" jsonb NOT NULL DEFAULT '{}',
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_image_pipeline_checkpoints" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "image_pipeline_checkpoints"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_image_assets_status_updated"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_image_assets_source"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "image_assets"`);
  }
}
