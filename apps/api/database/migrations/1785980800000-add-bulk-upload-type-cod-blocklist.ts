import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBulkUploadTypeCodBlocklist1785980800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "bulk_uploads_upload_type_enum" ADD VALUE IF NOT EXISTS 'COD_BLOCKLIST'
    `);
  }

  public async down(): Promise<void> {
    // Postgres cannot remove enum values safely; leave COD_BLOCKLIST in place.
  }
}
