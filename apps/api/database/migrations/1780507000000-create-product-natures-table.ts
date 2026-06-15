import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductNaturesTable1780507000000 implements MigrationInterface {
  name = 'CreateProductNaturesTable1780507000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "product_natures" (
        "id"         uuid                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"     character varying(11)             NOT NULL,
        "name"       character varying(255)            NOT NULL,
        "status"     "public"."brands_status_enum"     NOT NULL DEFAULT 'active',
        "created_by" character varying(255),
        "updated_by" character varying(255),
        "created_at" TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_product_natures"       PRIMARY KEY ("id"),
        CONSTRAINT "UQ_product_natures_ref_id" UNIQUE ("ref_id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_product_natures_name" ON "product_natures" ("name")`);
    await queryRunner.query(`CREATE INDEX "IDX_product_natures_status" ON "product_natures" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_natures_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_natures_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_natures"`);
  }
}
