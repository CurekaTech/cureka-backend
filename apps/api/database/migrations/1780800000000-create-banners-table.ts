import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBannersTable1780800000000 implements MigrationInterface {
  name = 'CreateBannersTable1780800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."banners_placement_enum" AS ENUM(
        'hero_primary',
        'hero_secondary',
        'main_promo',
        'brand_wise'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."banners_slot_enum" AS ENUM('default', 'left', 'right')
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."banners_resource_type_enum" AS ENUM(
        'product',
        'category',
        'brand',
        'external_url',
        'none'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."banners_status_enum" AS ENUM('active', 'inactive')
    `);

    await queryRunner.query(`
      CREATE TABLE "banners" (
        "id"              uuid                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"          character varying(11)             NOT NULL,
        "placement"       "public"."banners_placement_enum" NOT NULL,
        "slot"            "public"."banners_slot_enum"      NOT NULL DEFAULT 'default',
        "resource_type"   "public"."banners_resource_type_enum" NOT NULL,
        "resource_ref_id" character varying(11),
        "external_url"    character varying(2000),
        "title"           character varying(255)            NOT NULL,
        "image_url"       character varying(500)            NOT NULL,
        "sort_order"      integer                           NOT NULL DEFAULT 0,
        "status"          "public"."banners_status_enum"    NOT NULL DEFAULT 'active',
        "starts_at"       TIMESTAMPTZ,
        "ends_at"         TIMESTAMPTZ,
        "created_by"      character varying(255),
        "updated_by"      character varying(255),
        "created_at"      TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "deleted_at"      TIMESTAMPTZ,
        CONSTRAINT "PK_banners"           PRIMARY KEY ("id"),
        CONSTRAINT "UQ_banners_ref_id"    UNIQUE ("ref_id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_banners_placement" ON "banners" ("placement")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_banners_slot" ON "banners" ("slot")`);
    await queryRunner.query(`CREATE INDEX "IDX_banners_status" ON "banners" ("status")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_banners_placement_slot_status_sort" ON "banners" ("placement", "slot", "status", "sort_order")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_banners_placement_slot_status_sort"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_banners_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_banners_slot"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_banners_placement"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "banners"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."banners_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."banners_resource_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."banners_slot_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."banners_placement_enum"`);
  }
}
