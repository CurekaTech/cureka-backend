import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductCategoryHierarchies1780915700000 implements MigrationInterface {
  name = 'CreateProductCategoryHierarchies1780915700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "product_category_hierarchies" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "sort_order" int NOT NULL DEFAULT 0,
        "category_id" uuid NOT NULL,
        "sub_category_id" uuid,
        "sub_sub_category_id" uuid,
        "sub_sub_sub_category_id" uuid,
        CONSTRAINT "PK_product_category_hierarchies" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_category_hierarchies_product_id"
          FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_category_hierarchies_category_id"
          FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_product_category_hierarchies_sub_category_id"
          FOREIGN KEY ("sub_category_id") REFERENCES "categories"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_product_category_hierarchies_sub_sub_category_id"
          FOREIGN KEY ("sub_sub_category_id") REFERENCES "categories"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_product_category_hierarchies_sub_sub_sub_category_id"
          FOREIGN KEY ("sub_sub_sub_category_id") REFERENCES "categories"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_product_category_hierarchies_product_id" ON "product_category_hierarchies" ("product_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_category_hierarchies_category_id" ON "product_category_hierarchies" ("category_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_category_hierarchies_sub_category_id" ON "product_category_hierarchies" ("sub_category_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_category_hierarchies_sub_sub_category_id" ON "product_category_hierarchies" ("sub_sub_category_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_category_hierarchies_sub_sub_sub_category_id" ON "product_category_hierarchies" ("sub_sub_sub_category_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_category_hierarchies_product_sort" ON "product_category_hierarchies" ("product_id", "sort_order")`,
    );

    // Backfill primary hierarchy from existing product FK columns.
    await queryRunner.query(`
      INSERT INTO "product_category_hierarchies" (
        "product_id",
        "sort_order",
        "category_id",
        "sub_category_id",
        "sub_sub_category_id",
        "sub_sub_sub_category_id"
      )
      SELECT
        "id",
        0,
        "category_id",
        "sub_category_id",
        "sub_sub_category_id",
        "sub_sub_sub_category_id"
      FROM "products"
      WHERE "category_id" IS NOT NULL
        AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_category_hierarchies_product_sort"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_category_hierarchies_sub_sub_sub_category_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_category_hierarchies_sub_sub_category_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_category_hierarchies_sub_category_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_category_hierarchies_category_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_category_hierarchies_product_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_category_hierarchies"`);
  }
}
