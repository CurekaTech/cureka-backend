import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserAddressesTable1780822000000 implements MigrationInterface {
  name = 'CreateUserAddressesTable1780822000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."user_addresses_address_type_enum"
      AS ENUM ('HOME', 'OFFICE', 'OTHER')
    `);

    await queryRunner.query(`
      CREATE TABLE "user_addresses" (
        "id"              uuid                                      NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"          character varying(11)                     NOT NULL,
        "user_id"         uuid                                      NOT NULL,
        "recipient_name"  character varying(150)                    NOT NULL,
        "phone_number"    character varying(10)                     NOT NULL,
        "pincode"         character varying(6)                      NOT NULL,
        "address_line1"   character varying(255)                    NOT NULL,
        "address_line2"   character varying(255),
        "landmark"        character varying(255),
        "city"            character varying(100)                    NOT NULL,
        "state"           character varying(100)                    NOT NULL,
        "address_type"    "public"."user_addresses_address_type_enum" NOT NULL,
        "is_default"      boolean                                   NOT NULL DEFAULT false,
        "created_by"      character varying(255),
        "updated_by"      character varying(255),
        "created_at"      TIMESTAMPTZ                               NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMPTZ                               NOT NULL DEFAULT now(),
        "deleted_at"      TIMESTAMPTZ,
        CONSTRAINT "PK_user_addresses" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_addresses_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_user_addresses_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_user_addresses_user_id"
      ON "user_addresses" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_user_addresses_is_default"
      ON "user_addresses" ("is_default")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_user_addresses_one_default_per_user"
      ON "user_addresses" ("user_id")
      WHERE "is_default" = true AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_user_addresses_one_default_per_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_addresses_is_default"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_addresses_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_addresses"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."user_addresses_address_type_enum"`);
  }
}
