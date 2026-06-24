import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductInformationLabelsTable1780826000000 implements MigrationInterface {
  name = 'CreateProductInformationLabelsTable1780826000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "product_information_labels" (
        "id"         uuid                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"     character varying(11)             NOT NULL,
        "name"       character varying(255)            NOT NULL,
        "status"     "public"."brands_status_enum"     NOT NULL DEFAULT 'active',
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_product_information_labels"       PRIMARY KEY ("id"),
        CONSTRAINT "UQ_product_information_labels_ref_id" UNIQUE ("ref_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_information_labels_name" ON "product_information_labels" ("name")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_product_information_labels_name_active"
      ON "product_information_labels" ("name")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_information_labels_status" ON "product_information_labels" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_information_labels_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_product_information_labels_name_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_information_labels_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_information_labels"`);
  }
}
