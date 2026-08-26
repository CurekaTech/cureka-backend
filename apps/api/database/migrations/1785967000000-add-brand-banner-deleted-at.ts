import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBrandBannerDeletedAt1785967000000 implements MigrationInterface {
  name = 'AddBrandBannerDeletedAt1785967000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "brands"
      ADD COLUMN IF NOT EXISTS "banner_deleted_at" timestamptz
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "brands"
      DROP COLUMN IF EXISTS "banner_deleted_at"
    `);
  }
}
