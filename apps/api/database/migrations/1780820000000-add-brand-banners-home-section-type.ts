import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBrandBannersHomeSectionType1780820000000 implements MigrationInterface {
  name = 'AddBrandBannersHomeSectionType1780820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "home_sections_type_enum" ADD VALUE IF NOT EXISTS 'brandBanners'
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL does not support removing enum values safely.
  }
}
