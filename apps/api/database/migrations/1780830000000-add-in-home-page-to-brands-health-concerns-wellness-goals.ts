import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInHomePageToBrandsHealthConcernsWellnessGoals1780830000000
  implements MigrationInterface
{
  name = 'AddInHomePageToBrandsHealthConcernsWellnessGoals1780830000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "brands"
      ADD COLUMN "in_home_page" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      ADD COLUMN "in_home_page" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "wellness_goals"
      ADD COLUMN "in_home_page" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "wellness_goals" DROP COLUMN "in_home_page"`);
    await queryRunner.query(`ALTER TABLE "health_concerns" DROP COLUMN "in_home_page"`);
    await queryRunner.query(`ALTER TABLE "brands" DROP COLUMN "in_home_page"`);
  }
}
