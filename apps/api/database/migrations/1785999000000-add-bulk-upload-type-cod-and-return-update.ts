import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBulkUploadTypeCodAndReturnUpdate1785999000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "bulk_uploads_upload_type_enum" ADD VALUE IF NOT EXISTS 'COD_UPDATE'
    `);
    await queryRunner.query(`
      ALTER TYPE "bulk_uploads_upload_type_enum" ADD VALUE IF NOT EXISTS 'RETURN_UPDATE'
    `);
  }

  public async down(): Promise<void> {
    // Postgres cannot remove enum values safely; leave COD_UPDATE and RETURN_UPDATE in place.
  }
}
