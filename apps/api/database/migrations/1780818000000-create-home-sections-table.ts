import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateHomeSectionsTable1780818000000 implements MigrationInterface {
  name = 'CreateHomeSectionsTable1780818000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "home_sections_type_enum" AS ENUM (
        'heroBanner',
        'builtByDoctorsBanner',
        'shopByCategory',
        'bestSellers',
        'expertCuratedBundles',
        'mothersDayBanner',
        'curatedWellnessEssentials',
        'consultDoctors',
        'healthReads',
        'watchAndShop'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "home_sections_status_enum" AS ENUM ('active', 'inactive')
    `);

    await queryRunner.query(`
      CREATE TABLE "home_sections" (
        "id"            uuid                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"        character varying(11)             NOT NULL,
        "title"         character varying(255)            NOT NULL,
        "slug"          character varying(255)            NOT NULL,
        "type"          "home_sections_type_enum"         NOT NULL,
        "section_index" integer                           NOT NULL,
        "status"        "home_sections_status_enum"       NOT NULL DEFAULT 'active',
        "created_by"    character varying(255),
        "updated_by"    character varying(255),
        "created_at"    TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "deleted_at"    TIMESTAMPTZ,
        CONSTRAINT "PK_home_sections"       PRIMARY KEY ("id"),
        CONSTRAINT "UQ_home_sections_ref_id" UNIQUE ("ref_id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_home_sections_status_index" ON "home_sections" ("status", "section_index")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_home_sections_type" ON "home_sections" ("type")`);
    await queryRunner.query(`CREATE INDEX "IDX_home_sections_status" ON "home_sections" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_home_sections_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_home_sections_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_home_sections_status_index"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "home_sections"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "home_sections_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "home_sections_type_enum"`);
  }
}
