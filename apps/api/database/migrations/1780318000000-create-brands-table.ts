import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBrandsTable1780318000000 implements MigrationInterface {
  name = 'CreateBrandsTable1780318000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."brands_status_enum"
      AS ENUM ('active', 'inactive')
    `);

    await queryRunner.query(`
      CREATE TABLE "brands" (
        "id"               uuid                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"           character varying(11)             NOT NULL,
        "name"             character varying(255)            NOT NULL,
        "slug"             character varying(300)            NOT NULL,
        "logo"             character varying(500),
        "banner"           character varying(500),
        "description"      text,
        "status"           "public"."brands_status_enum"     NOT NULL DEFAULT 'active',
        "meta_title"       character varying(255),
        "meta_description" text,
        "meta_keywords"    text[],
        "updated_by"       character varying(255),
        "created_at"       TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMPTZ,
        CONSTRAINT "PK_brands"         PRIMARY KEY ("id"),
        CONSTRAINT "UQ_brands_ref_id"  UNIQUE ("ref_id"),
        CONSTRAINT "UQ_brands_name"    UNIQUE ("name"),
        CONSTRAINT "UQ_brands_slug"    UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_brands_name" ON "brands" ("name")`);
    await queryRunner.query(`CREATE INDEX "IDX_brands_slug" ON "brands" ("slug")`);
    await queryRunner.query(`CREATE INDEX "IDX_brands_status" ON "brands" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_brands_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_brands_slug"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_brands_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "brands"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."brands_status_enum"`);
  }
}
