import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDescriptionToCategories1780834000000 implements MigrationInterface {
  name = 'AddDescriptionToCategories1780834000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "categories"
      ADD COLUMN "description" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "categories"
      DROP COLUMN "description"
    `);
  }
}
