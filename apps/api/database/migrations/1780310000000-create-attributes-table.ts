import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAttributesTable1780310000000 implements MigrationInterface {
  name = 'CreateAttributesTable1780310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the enum type for data_type column
    await queryRunner.query(`
      CREATE TYPE "public"."attributes_data_type_enum"
      AS ENUM ('string', 'int', 'float', 'boolean')
    `);

    // Create the attributes table
    await queryRunner.query(`
      CREATE TABLE "attributes" (
        "id"         uuid                                   NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"     character varying(11)                 NOT NULL,
        "name"       character varying(255)                NOT NULL,
        "data_type"  "public"."attributes_data_type_enum"  NOT NULL,
        "updated_by" character varying(255),
        "created_at" TIMESTAMPTZ                           NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ                           NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_attributes"      PRIMARY KEY ("id"),
        CONSTRAINT "UQ_attributes_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_attributes_name"   UNIQUE ("name")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "attributes"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."attributes_data_type_enum"`);
  }
}
