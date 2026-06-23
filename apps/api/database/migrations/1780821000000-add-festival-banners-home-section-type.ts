import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFestivalBannersHomeSectionType1780821000000 implements MigrationInterface {
  name = 'AddFestivalBannersHomeSectionType1780821000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "home_sections_type_enum" ADD VALUE IF NOT EXISTS 'festivalBanners'
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL does not support removing enum values safely.
  }
}
