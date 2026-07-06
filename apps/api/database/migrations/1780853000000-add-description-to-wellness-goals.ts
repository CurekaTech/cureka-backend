import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDescriptionToWellnessGoals1780853000000 implements MigrationInterface {
  name = 'AddDescriptionToWellnessGoals1780853000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "wellness_goals"
      ADD COLUMN "description" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "wellness_goals"
      DROP COLUMN "description"
    `);
  }
}
