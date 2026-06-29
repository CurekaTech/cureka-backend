import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSortOrderToProductInformationLabels1780831000000 implements MigrationInterface {
  name = 'AddSortOrderToProductInformationLabels1780831000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_information_labels"
      ADD COLUMN "sort_order" integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_information_labels_sort_order"
      ON "product_information_labels" ("sort_order")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_information_labels_sort_order"`);
    await queryRunner.query(`
      ALTER TABLE "product_information_labels"
      DROP COLUMN IF EXISTS "sort_order"
    `);
  }
}
