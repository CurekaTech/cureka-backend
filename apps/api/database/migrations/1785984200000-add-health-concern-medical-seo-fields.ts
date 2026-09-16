import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHealthConcernMedicalSeoFields1785984200000 implements MigrationInterface {
  name = 'AddHealthConcernMedicalSeoFields1785984200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      ADD COLUMN IF NOT EXISTS "alternate_name" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      ADD COLUMN IF NOT EXISTS "medical_condition_description" text
    `);
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      ADD COLUMN IF NOT EXISTS "reviewed_by_name" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      ADD COLUMN IF NOT EXISTS "reviewed_by_job_title" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      ADD COLUMN IF NOT EXISTS "last_reviewed" date
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      DROP COLUMN IF EXISTS "last_reviewed"
    `);
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      DROP COLUMN IF EXISTS "reviewed_by_job_title"
    `);
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      DROP COLUMN IF EXISTS "reviewed_by_name"
    `);
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      DROP COLUMN IF EXISTS "medical_condition_description"
    `);
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      DROP COLUMN IF EXISTS "alternate_name"
    `);
  }
}
