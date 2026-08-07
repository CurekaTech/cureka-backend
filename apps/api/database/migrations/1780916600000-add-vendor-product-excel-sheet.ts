import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVendorProductExcelSheet1780916600000 implements MigrationInterface {
  name = 'AddVendorProductExcelSheet1780916600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendors"
      ADD COLUMN IF NOT EXISTS "product_excel_sheet" jsonb
    `);

    // Existing rows (if any) get a placeholder so NOT NULL can be applied.
    await queryRunner.query(`
      UPDATE "vendors"
      SET "product_excel_sheet" = '{"key":"vendor-documents/legacy-missing-product-sheet","name":"legacy"}'::jsonb
      WHERE "product_excel_sheet" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "vendors"
      ALTER COLUMN "product_excel_sheet" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendors"
      DROP COLUMN IF EXISTS "product_excel_sheet"
    `);
  }
}
