import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUnitsTable1780829000000 implements MigrationInterface {
  name = 'CreateUnitsTable1780829000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "units" (
        "id"         uuid                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"     character varying(11)             NOT NULL,
        "name"       character varying(255)            NOT NULL,
        "status"     "public"."brands_status_enum"     NOT NULL DEFAULT 'active',
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_units"       PRIMARY KEY ("id"),
        CONSTRAINT "UQ_units_ref_id" UNIQUE ("ref_id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_units_name" ON "units" ("name")`);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_units_name_active"
      ON "units" ("name")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`CREATE INDEX "IDX_units_status" ON "units" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_units_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_units_name_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_units_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "units"`);
  }
}
