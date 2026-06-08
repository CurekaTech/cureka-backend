import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateImportersTable1780505000000 implements MigrationInterface {
  name = 'CreateImportersTable1780505000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."importers_status_enum"
      AS ENUM ('active', 'inactive')
    `);

    await queryRunner.query(`
      CREATE TABLE "importers" (
        "id"                  uuid                                  NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"              character varying(11)                 NOT NULL,
        "name"                character varying(255)                NOT NULL,
        "code"                character varying(100)                NOT NULL,
        "iec"                 character varying(100),
        "logo"                character varying(500),
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
        "status"              "public"."importers_status_enum"      NOT NULL DEFAULT 'active',
        "created_by"          character varying(255),
        "updated_by"          character varying(255),
        "created_at"          TIMESTAMPTZ                           NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMPTZ                           NOT NULL DEFAULT now(),
        "deleted_at"          TIMESTAMPTZ,
        CONSTRAINT "PK_importers"         PRIMARY KEY ("id"),
        CONSTRAINT "UQ_importers_ref_id"  UNIQUE ("ref_id"),
        CONSTRAINT "UQ_importers_code"    UNIQUE ("code"),
        CONSTRAINT "FK_importers_city"    FOREIGN KEY ("city_id")    REFERENCES "cities"("id")     ON DELETE SET NULL,
        CONSTRAINT "FK_importers_state"   FOREIGN KEY ("state_id")   REFERENCES "states"("id")    ON DELETE SET NULL,
        CONSTRAINT "FK_importers_country" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_importers_name"       ON "importers" ("name")`);
    await queryRunner.query(`CREATE INDEX "IDX_importers_code"       ON "importers" ("code")`);
    await queryRunner.query(`CREATE INDEX "IDX_importers_iec"        ON "importers" ("iec")`);
    await queryRunner.query(`CREATE INDEX "IDX_importers_status"     ON "importers" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_importers_city_id"   ON "importers" ("city_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_importers_state_id"  ON "importers" ("state_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_importers_country_id" ON "importers" ("country_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_importers_country_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_importers_state_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_importers_city_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_importers_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_importers_iec"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_importers_code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_importers_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "importers"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."importers_status_enum"`);
  }
}
