import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTestimonialsTable1780906300000 implements MigrationInterface {
  name = 'CreateTestimonialsTable1780906300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."testimonials_status_enum" AS ENUM('active', 'inactive')
    `);

    await queryRunner.query(`
      CREATE TABLE "testimonials" (
        "id"            uuid                                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"        character varying(16)                             NOT NULL,
        "name"          character varying(200)                            NOT NULL,
        "city"          character varying(150)                            NOT NULL,
        "rating"        numeric(2,1)                                      NOT NULL DEFAULT 5.0,
        "description"   text                                              NOT NULL,
        "image"         jsonb,
        "sort_order"    integer                                           NOT NULL DEFAULT 0,
        "status"        "public"."testimonials_status_enum"               NOT NULL DEFAULT 'active',
        "created_by"    character varying(255),
        "updated_by"    character varying(255),
        "created_at"    TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "deleted_at"    TIMESTAMPTZ,
        CONSTRAINT "PK_testimonials"        PRIMARY KEY ("id"),
        CONSTRAINT "UQ_testimonials_ref_id" UNIQUE ("ref_id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_testimonials_status" ON "testimonials" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_testimonials_status_sort" ON "testimonials" ("status", "sort_order")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_testimonials_status_sort"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_testimonials_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "testimonials"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."testimonials_status_enum"`);
  }
}
