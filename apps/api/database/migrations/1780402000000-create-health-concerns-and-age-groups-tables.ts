import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateHealthConcernsAndAgeGroupsTables1780402000000 implements MigrationInterface {
  name = 'CreateHealthConcernsAndAgeGroupsTables1780402000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "health_concerns" (
        "id"           uuid                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"       character varying(11)             NOT NULL,
        "name"         character varying(255)            NOT NULL,
        "icon"         character varying(500),
        "slug"         character varying(300)            NOT NULL,
        "description"  text,
        "banner"       character varying(500),
        "status"       "public"."brands_status_enum"     NOT NULL DEFAULT 'active',
        "created_by"   character varying(255),
        "updated_by"   character varying(255),
        "created_at"   TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "deleted_at"   TIMESTAMPTZ,
        CONSTRAINT "PK_health_concerns"       PRIMARY KEY ("id"),
        CONSTRAINT "UQ_health_concerns_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_health_concerns_name"   UNIQUE ("name"),
        CONSTRAINT "UQ_health_concerns_slug"   UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_health_concerns_name" ON "health_concerns" ("name")`);
    await queryRunner.query(`CREATE INDEX "IDX_health_concerns_slug" ON "health_concerns" ("slug")`);
    await queryRunner.query(`CREATE INDEX "IDX_health_concerns_status" ON "health_concerns" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "age_groups" (
        "id"           uuid                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"       character varying(11)             NOT NULL,
        "name"         character varying(255)            NOT NULL,
        "from_years"   integer                           NOT NULL,
        "from_months"  integer                           NOT NULL,
        "to_years"     integer                           NOT NULL,
        "to_months"    integer                           NOT NULL,
        "status"       "public"."brands_status_enum"     NOT NULL DEFAULT 'active',
        "created_by"   character varying(255),
        "updated_by"   character varying(255),
        "created_at"   TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "deleted_at"   TIMESTAMPTZ,
        CONSTRAINT "PK_age_groups"       PRIMARY KEY ("id"),
        CONSTRAINT "UQ_age_groups_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_age_groups_name"   UNIQUE ("name")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_age_groups_name" ON "age_groups" ("name")`);
    await queryRunner.query(`CREATE INDEX "IDX_age_groups_status" ON "age_groups" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_age_groups_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_age_groups_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "age_groups"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_health_concerns_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_health_concerns_slug"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_health_concerns_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "health_concerns"`);
  }
}
