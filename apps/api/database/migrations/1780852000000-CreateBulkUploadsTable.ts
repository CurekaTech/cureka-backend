import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBulkUploadsTable1780852000000 implements MigrationInterface {
  name = 'CreateBulkUploadsTable1780852000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."bulk_uploads_status_enum"
      AS ENUM ('pending', 'validating', 'queued', 'processing', 'completed', 'failed', 'partial_success')
    `);

    await queryRunner.query(`
      CREATE TABLE "bulk_uploads" (
        "id"               uuid                                  NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"           character varying(11)                 NOT NULL,
        "status"           "public"."bulk_uploads_status_enum"   NOT NULL DEFAULT 'pending',
        "file_url"         character varying(1000)                NOT NULL,
        "error_file_url"   character varying(1000),
        "total_rows"       integer                               NOT NULL DEFAULT 0,
        "processed_rows"   integer                               NOT NULL DEFAULT 0,
        "successful_rows"  integer                               NOT NULL DEFAULT 0,
        "failed_rows"      integer                               NOT NULL DEFAULT 0,
        "error_summary"    jsonb                                 NOT NULL DEFAULT '[]'::jsonb,
        "created_by"       character varying(255),
        "updated_by"       character varying(255),
        "completed_at"     TIMESTAMPTZ,
        "created_at"       TIMESTAMPTZ                           NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ                           NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMPTZ,
        CONSTRAINT "PK_bulk_uploads" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_bulk_uploads_ref_id" UNIQUE ("ref_id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_bulk_uploads_status" ON "bulk_uploads" ("status")`);

    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN IF NOT EXISTS "tax_class" character varying(100)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "tax_class"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bulk_uploads_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bulk_uploads"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."bulk_uploads_status_enum"`);
  }
}
