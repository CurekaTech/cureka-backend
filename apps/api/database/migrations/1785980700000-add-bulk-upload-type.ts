import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBulkUploadType1785980700000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "bulk_uploads_upload_type_enum" AS ENUM ('PRODUCT', 'PRICE_UPDATE');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "bulk_uploads"
      ADD COLUMN IF NOT EXISTS "upload_type" "bulk_uploads_upload_type_enum" NOT NULL DEFAULT 'PRODUCT'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bulk_uploads_upload_type"
      ON "bulk_uploads" ("upload_type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bulk_uploads_upload_type"`);
    await queryRunner.query(`
      ALTER TABLE "bulk_uploads"
      DROP COLUMN IF EXISTS "upload_type"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "bulk_uploads_upload_type_enum"`);
  }
}
