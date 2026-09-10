import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMasterFaqs1785980900000 implements MigrationInterface {
  name = 'AddMasterFaqs1785980900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "categories"
      ADD COLUMN IF NOT EXISTS "faqs" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "brands"
      ADD COLUMN IF NOT EXISTS "faqs" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "wellness_goals"
      ADD COLUMN IF NOT EXISTS "faqs" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "health_concerns"
      ADD COLUMN IF NOT EXISTS "faqs" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "health_concerns" DROP COLUMN IF EXISTS "faqs"
    `);
    await queryRunner.query(`
      ALTER TABLE "wellness_goals" DROP COLUMN IF EXISTS "faqs"
    `);
    await queryRunner.query(`
      ALTER TABLE "brands" DROP COLUMN IF EXISTS "faqs"
    `);
    await queryRunner.query(`
      ALTER TABLE "categories" DROP COLUMN IF EXISTS "faqs"
    `);
  }
}
