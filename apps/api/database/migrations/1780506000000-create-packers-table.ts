import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePackersTable1780506000000 implements MigrationInterface {
  name = 'CreatePackersTable1780506000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."packers_status_enum"
      AS ENUM ('active', 'inactive')
    `);

    await queryRunner.query(`
      CREATE TABLE "packers" (
        "id"                  uuid                                  NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"              character varying(11)                 NOT NULL,
        "name"                character varying(255)                NOT NULL,
        "code"                character varying(100)                NOT NULL,
        "logo"                character varying(500),
        "description"         text,
        "contact_person"      character varying(255),
        "email"               character varying(255),
        "mobile_number"       character varying(20),
        "address_line1"       character varying(500),
        "address_line2"       character varying(500),
        "landmark"            character varying(255),
        "city_id"             uuid,
        "state_id"            uuid,
        "country_id"          uuid,
        "pin_code"            character varying(20),
        "gst_number"          character varying(50),
        "drug_license_number" character varying(100),
        "status"              "public"."packers_status_enum"        NOT NULL DEFAULT 'active',
        "remarks"             text,
        "created_by"          character varying(255),
        "updated_by"          character varying(255),
        "created_at"          TIMESTAMPTZ                           NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMPTZ                           NOT NULL DEFAULT now(),
        "deleted_at"          TIMESTAMPTZ,
        CONSTRAINT "PK_packers"         PRIMARY KEY ("id"),
        CONSTRAINT "UQ_packers_ref_id"  UNIQUE ("ref_id"),
        CONSTRAINT "UQ_packers_code"    UNIQUE ("code"),
        CONSTRAINT "FK_packers_city"    FOREIGN KEY ("city_id")    REFERENCES "cities"("id")     ON DELETE SET NULL,
        CONSTRAINT "FK_packers_state"   FOREIGN KEY ("state_id")   REFERENCES "states"("id")    ON DELETE SET NULL,
        CONSTRAINT "FK_packers_country" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_packers_name"        ON "packers" ("name")`);
    await queryRunner.query(`CREATE INDEX "IDX_packers_code"        ON "packers" ("code")`);
    await queryRunner.query(`CREATE INDEX "IDX_packers_status"     ON "packers" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_packers_city_id"    ON "packers" ("city_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_packers_state_id"   ON "packers" ("state_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_packers_country_id" ON "packers" ("country_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_packers_country_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_packers_state_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_packers_city_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_packers_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_packers_code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_packers_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "packers"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."packers_status_enum"`);
  }
}
