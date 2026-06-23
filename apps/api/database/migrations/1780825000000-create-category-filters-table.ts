import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCategoryFiltersTable1780825000000 implements MigrationInterface {
  name = 'CreateCategoryFiltersTable1780825000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "category_filters" (
        "id"         uuid                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"     character varying(11)             NOT NULL,
        "name"       character varying(255)            NOT NULL,
        "status"     "public"."brands_status_enum"     NOT NULL DEFAULT 'active',
        "values"     text[],
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_category_filters"       PRIMARY KEY ("id"),
        CONSTRAINT "UQ_category_filters_ref_id" UNIQUE ("ref_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_category_filters_name" ON "category_filters" ("name")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_category_filters_name_active"
      ON "category_filters" ("name")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_category_filters_status" ON "category_filters" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_category_filters_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_category_filters_name_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_category_filters_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "category_filters"`);
  }
}
