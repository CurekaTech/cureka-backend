import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCountriesStatesCitiesTables1780401000000 implements MigrationInterface {
  name = 'CreateCountriesStatesCitiesTables1780401000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "countries" (
        "id"          uuid                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"      character varying(11)             NOT NULL,
        "name"        character varying(255)            NOT NULL,
        "code"        character varying(3)              NOT NULL,
        "phone_code"  character varying(10),
        "status"      "public"."brands_status_enum"     NOT NULL DEFAULT 'active',
        "created_by"  character varying(255),
        "updated_by"  character varying(255),
        "created_at"  TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "deleted_at"  TIMESTAMPTZ,
        CONSTRAINT "PK_countries"        PRIMARY KEY ("id"),
        CONSTRAINT "UQ_countries_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_countries_name"   UNIQUE ("name"),
        CONSTRAINT "UQ_countries_code"   UNIQUE ("code")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_countries_name" ON "countries" ("name")`);
    await queryRunner.query(`CREATE INDEX "IDX_countries_code" ON "countries" ("code")`);
    await queryRunner.query(`CREATE INDEX "IDX_countries_status" ON "countries" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "states" (
        "id"          uuid                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"      character varying(11)             NOT NULL,
        "name"        character varying(255)            NOT NULL,
        "code"        character varying(10),
        "country_id"  uuid                              NOT NULL,
        "status"      "public"."brands_status_enum"     NOT NULL DEFAULT 'active',
        "created_by"  character varying(255),
        "updated_by"  character varying(255),
        "created_at"  TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "deleted_at"  TIMESTAMPTZ,
        CONSTRAINT "PK_states"              PRIMARY KEY ("id"),
        CONSTRAINT "UQ_states_ref_id"       UNIQUE ("ref_id"),
        CONSTRAINT "UQ_states_country_name" UNIQUE ("country_id", "name"),
        CONSTRAINT "FK_states_country"      FOREIGN KEY ("country_id")
          REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_states_country_id" ON "states" ("country_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_states_status" ON "states" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "cities" (
        "id"          uuid                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"      character varying(11)             NOT NULL,
        "name"        character varying(255)            NOT NULL,
        "state_id"    uuid                              NOT NULL,
        "status"      "public"."brands_status_enum"     NOT NULL DEFAULT 'active',
        "created_by"  character varying(255),
        "updated_by"  character varying(255),
        "created_at"  TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "deleted_at"  TIMESTAMPTZ,
        CONSTRAINT "PK_cities"            PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cities_ref_id"     UNIQUE ("ref_id"),
        CONSTRAINT "UQ_cities_state_name" UNIQUE ("state_id", "name"),
        CONSTRAINT "FK_cities_state"      FOREIGN KEY ("state_id")
          REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_cities_state_id" ON "cities" ("state_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_cities_status" ON "cities" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cities_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cities_state_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cities"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_states_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_states_country_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "states"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_countries_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_countries_code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_countries_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "countries"`);
  }
}
