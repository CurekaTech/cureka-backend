import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSubscriptionFrequenciesTable1780810000000 implements MigrationInterface {
  name = 'CreateSubscriptionFrequenciesTable1780810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."subscription_frequencies_unit_enum" AS ENUM ('day', 'month')
    `);

    await queryRunner.query(`
      CREATE TABLE "subscription_frequencies" (
        "id"         uuid                                          NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"     character varying(11)                         NOT NULL,
        "name"       character varying(255)                        NOT NULL,
        "value"      integer                                       NOT NULL,
        "unit"       "public"."subscription_frequencies_unit_enum" NOT NULL,
        "status"     "public"."brands_status_enum"                 NOT NULL DEFAULT 'active',
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" TIMESTAMPTZ                                   NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ                                   NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_subscription_frequencies"       PRIMARY KEY ("id"),
        CONSTRAINT "UQ_subscription_frequencies_ref_id" UNIQUE ("ref_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_subscription_frequencies_name"
      ON "subscription_frequencies" ("name")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_subscription_frequencies_unit"
      ON "subscription_frequencies" ("unit")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_subscription_frequencies_status"
      ON "subscription_frequencies" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_subscription_frequencies_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_subscription_frequencies_unit"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_subscription_frequencies_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscription_frequencies"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."subscription_frequencies_unit_enum"`);
  }
}
