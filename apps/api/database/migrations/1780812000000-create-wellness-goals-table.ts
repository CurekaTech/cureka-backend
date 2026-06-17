import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWellnessGoalsTable1780812000000 implements MigrationInterface {
  name = 'CreateWellnessGoalsTable1780812000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "wellness_goals" (
        "id"         uuid                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"     character varying(11)             NOT NULL,
        "name"       character varying(255)            NOT NULL,
        "image"      character varying(500),
        "status"     "public"."brands_status_enum"     NOT NULL DEFAULT 'active',
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_wellness_goals"       PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wellness_goals_ref_id" UNIQUE ("ref_id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_wellness_goals_name" ON "wellness_goals" ("name")`);
    await queryRunner.query(`CREATE INDEX "IDX_wellness_goals_status" ON "wellness_goals" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wellness_goals_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wellness_goals_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wellness_goals"`);
  }
}
