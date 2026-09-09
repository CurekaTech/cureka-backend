import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHealthConcernsHomeSectionType1785980500000 implements MigrationInterface {
  name = 'AddHealthConcernsHomeSectionType1785980500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "home_sections_type_enum" ADD VALUE IF NOT EXISTS 'healthConcerns'
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL does not support removing enum values safely.
  }
}
