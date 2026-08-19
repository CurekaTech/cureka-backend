import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHealthConcernMetaColumns1785961000000 implements MigrationInterface {
  name = 'AddHealthConcernMetaColumns1785961000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      ADD COLUMN IF NOT EXISTS "meta_title" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      ADD COLUMN IF NOT EXISTS "meta_description" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      DROP COLUMN IF EXISTS "meta_description"
    `);
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      DROP COLUMN IF EXISTS "meta_title"
    `);
  }
}
