import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImagesZipUrlToBulkUploads1780853000000 implements MigrationInterface {
  name = 'AddImagesZipUrlToBulkUploads1780853000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bulk_uploads"
      ADD COLUMN "images_zip_url" character varying(1000)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bulk_uploads"
      DROP COLUMN "images_zip_url"
    `);
  }
}
