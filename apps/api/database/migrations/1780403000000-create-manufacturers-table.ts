import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateManufacturersTable1780403000000 implements MigrationInterface {
  name = 'CreateManufacturersTable1780403000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."manufacturers_status_enum"
      AS ENUM ('active', 'inactive')
    `);

    await queryRunner.query(`
      CREATE TABLE "manufacturers" (
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
        "status"              "public"."manufacturers_status_enum"  NOT NULL DEFAULT 'active',
        "created_by"          character varying(255),
        "updated_by"          character varying(255),
        "created_at"          TIMESTAMPTZ                           NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMPTZ                           NOT NULL DEFAULT now(),
        "deleted_at"          TIMESTAMPTZ,
        CONSTRAINT "PK_manufacturers"         PRIMARY KEY ("id"),
        CONSTRAINT "UQ_manufacturers_ref_id"  UNIQUE ("ref_id"),
        CONSTRAINT "UQ_manufacturers_name"    UNIQUE ("name"),
        CONSTRAINT "UQ_manufacturers_code"    UNIQUE ("code"),
        CONSTRAINT "FK_manufacturers_city"    FOREIGN KEY ("city_id")    REFERENCES "cities"("id")     ON DELETE SET NULL,
        CONSTRAINT "FK_manufacturers_state"   FOREIGN KEY ("state_id")   REFERENCES "states"("id")    ON DELETE SET NULL,
        CONSTRAINT "FK_manufacturers_country" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "manufacturer_categories" (
        "manufacturer_id" uuid NOT NULL,
        "category_id"     uuid NOT NULL,
        CONSTRAINT "PK_manufacturer_categories" PRIMARY KEY ("manufacturer_id", "category_id"),
        CONSTRAINT "FK_manufacturer_categories_manufacturer" FOREIGN KEY ("manufacturer_id") REFERENCES "manufacturers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_manufacturer_categories_category"     FOREIGN KEY ("category_id")    REFERENCES "categories"("id")    ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_manufacturers_name"                         ON "manufacturers"           ("name")`);
    await queryRunner.query(`CREATE INDEX "IDX_manufacturers_code"                         ON "manufacturers"           ("code")`);
    await queryRunner.query(`CREATE INDEX "IDX_manufacturers_status"                       ON "manufacturers"           ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_manufacturers_city_id"                      ON "manufacturers"           ("city_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_manufacturers_state_id"                     ON "manufacturers"           ("state_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_manufacturers_country_id"                   ON "manufacturers"           ("country_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_manufacturer_categories_manufacturer_id"    ON "manufacturer_categories" ("manufacturer_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_manufacturer_categories_category_id"        ON "manufacturer_categories" ("category_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_manufacturer_categories_category_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_manufacturer_categories_manufacturer_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_manufacturers_country_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_manufacturers_state_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_manufacturers_city_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_manufacturers_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_manufacturers_code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_manufacturers_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "manufacturer_categories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "manufacturers"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."manufacturers_status_enum"`);
  }
}
