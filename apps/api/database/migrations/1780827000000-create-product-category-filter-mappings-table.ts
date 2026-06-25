import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductCategoryFilterMappingsTable1780827000000 implements MigrationInterface {
  name = 'CreateProductCategoryFilterMappingsTable1780827000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "product_category_filter_mappings" (
        "product_id"         uuid NOT NULL,
        "category_filter_id" uuid NOT NULL,
        "value"              varchar(255) NOT NULL,
        CONSTRAINT "PK_product_category_filter_mappings"
          PRIMARY KEY ("product_id", "category_filter_id", "value"),
        CONSTRAINT "FK_product_category_filter_mappings_product"
          FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_category_filter_mappings_category_filter"
          FOREIGN KEY ("category_filter_id") REFERENCES "category_filters"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_category_filter_mappings_product_id"
      ON "product_category_filter_mappings" ("product_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_category_filter_mappings_category_filter_id"
      ON "product_category_filter_mappings" ("category_filter_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_category_filter_mappings_filter_value"
      ON "product_category_filter_mappings" ("category_filter_id", "value")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_category_filter_mappings_filter_value"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_category_filter_mappings_category_filter_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_category_filter_mappings_product_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_category_filter_mappings"`);
  }
}
