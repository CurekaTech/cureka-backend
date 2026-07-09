import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBulkUploadComplianceFields1780902000000 implements MigrationInterface {
  name = 'AddBulkUploadComplianceFields1780902000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN "packer_address" text,
      ADD COLUMN "importer_address" text
    `);

    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN "expiry_date" date,
      ADD COLUMN "batch_number" character varying(100),
      ADD COLUMN "gtin_number" character varying(100),
      ADD COLUMN "hsn_code" character varying(50)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      DROP COLUMN IF EXISTS "hsn_code",
      DROP COLUMN IF EXISTS "gtin_number",
      DROP COLUMN IF EXISTS "batch_number",
      DROP COLUMN IF EXISTS "expiry_date"
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "importer_address",
      DROP COLUMN IF EXISTS "packer_address"
    `);
  }
}
