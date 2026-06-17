import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategoryAboveBelowTheFoldColumns1780811000000 implements MigrationInterface {
  name = 'AddCategoryAboveBelowTheFoldColumns1780811000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "categories"
      ADD COLUMN "above_the_fold" text,
      ADD COLUMN "below_the_fold" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "categories"
      DROP COLUMN "above_the_fold",
      DROP COLUMN "below_the_fold"
    `);
  }
}
