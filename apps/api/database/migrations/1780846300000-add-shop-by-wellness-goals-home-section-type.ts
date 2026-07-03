import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShopByWellnessGoalsHomeSectionType1780846300000
  implements MigrationInterface
{
  name = 'AddShopByWellnessGoalsHomeSectionType1780846300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "home_sections_type_enum" ADD VALUE IF NOT EXISTS 'shopByWellnessGoals'
    `);
    await queryRunner.query(`
      ALTER TYPE "home_sections_type_enum" ADD VALUE IF NOT EXISTS 'brandsWeTrust'
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL does not support removing enum values safely.
  }
}
