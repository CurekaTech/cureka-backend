import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductWizardFields1780510000000 implements MigrationInterface {
  name = 'AddProductWizardFields1780510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."products_status_enum"
      ADD VALUE IF NOT EXISTS 'pending_review'
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."products_status_enum"
      ADD VALUE IF NOT EXISTS 'rejected'
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "creation_step" integer NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "rejection_reason" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "rejection_reason"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "creation_step"`);
  }
}
