import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCategoryCategoryFiltersTable1780834100000 implements MigrationInterface {
  name = 'CreateCategoryCategoryFiltersTable1780834100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "category_filter_mappings" (
        "category_id" uuid NOT NULL,
        "category_filter_id" uuid NOT NULL,
        CONSTRAINT "PK_category_filter_mappings"
          PRIMARY KEY ("category_id", "category_filter_id"),
        CONSTRAINT "FK_category_filter_mappings_category"
          FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_category_filter_mappings_category_filter"
          FOREIGN KEY ("category_filter_id") REFERENCES "category_filters"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_category_filter_mappings_category_id"
      ON "category_filter_mappings" ("category_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_category_filter_mappings_category_filter_id"
      ON "category_filter_mappings" ("category_filter_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_category_filter_mappings_category_filter_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_category_filter_mappings_category_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "category_filter_mappings"`);
  }
}
