import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHealthConcernSortIndex1785916000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      ADD COLUMN IF NOT EXISTS "sort_index" integer DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      DROP COLUMN IF EXISTS "sort_index"
    `);
  }
}
