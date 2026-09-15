import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHealthConcernMedicalAudience1785983000000 implements MigrationInterface {
  name = 'AddHealthConcernMedicalAudience1785983000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "health_concerns_patient_audience_enum" AS ENUM ('KIDS', 'ADULTS', 'ALL');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      ADD COLUMN IF NOT EXISTS "medical_condition_name" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      ADD COLUMN IF NOT EXISTS "patient_audience" "health_concerns_patient_audience_enum"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      DROP COLUMN IF EXISTS "patient_audience"
    `);
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      DROP COLUMN IF EXISTS "medical_condition_name"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "health_concerns_patient_audience_enum"
    `);
  }
}
