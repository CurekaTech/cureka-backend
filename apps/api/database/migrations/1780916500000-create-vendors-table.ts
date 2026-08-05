import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVendorsTable1780916500000 implements MigrationInterface {
  name = 'CreateVendorsTable1780916500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."vendors_status_enum" AS ENUM(
        'PENDING',
        'VERIFIED',
        'ACTIVE',
        'REJECTED',
        'CORRECTION_REQUIRED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."vendors_source_enum" AS ENUM('PUBLIC', 'ADMIN')
    `);

    await queryRunner.query(`
      CREATE TABLE "vendors" (
        "id"                        uuid                                      NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"                    character varying(16)                     NOT NULL,
        "user_id"                   uuid                                      NOT NULL,
        "company_name"              character varying(255)                    NOT NULL,
        "contact_person"            character varying(255)                    NOT NULL,
        "email"                     character varying(255)                    NOT NULL,
        "mobile_number"             character varying(20)                     NOT NULL,
        "business_address"          text                                      NOT NULL,
        "warehouse_address"         text                                      NOT NULL,
        "warehouse_pincode"         character varying(20)                     NOT NULL,
        "warehouse_contact_person"  character varying(255),
        "warehouse_contact_phone"   character varying(20),
        "pan_number"                character varying(10)                     NOT NULL,
        "pan_document"              jsonb                                     NOT NULL,
        "gst_number"                character varying(20)                     NOT NULL,
        "gst_certificate_document"  jsonb                                     NOT NULL,
        "product_excel_sheet"       jsonb                                     NOT NULL,
        "product_categories"        text,
        "brand_details"             text,
        "company_profile"           text,
        "status"                    "public"."vendors_status_enum"            NOT NULL DEFAULT 'PENDING',
        "source"                    "public"."vendors_source_enum"            NOT NULL,
        "warehouse_code"            character varying(100),
        "created_by"                character varying(255),
        "updated_by"                character varying(255),
        "created_at"                TIMESTAMPTZ                               NOT NULL DEFAULT now(),
        "updated_at"                TIMESTAMPTZ                               NOT NULL DEFAULT now(),
        "deleted_at"                TIMESTAMPTZ,
        CONSTRAINT "PK_vendors" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_vendors_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "UQ_vendors_user_id" UNIQUE ("user_id"),
        CONSTRAINT "FK_vendors_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_vendors_status" ON "vendors" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_vendors_email" ON "vendors" ("email")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_vendors_mobile_number" ON "vendors" ("mobile_number")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_vendors_mobile_number"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_vendors_email"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_vendors_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vendors"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."vendors_source_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."vendors_status_enum"`);
  }
}
