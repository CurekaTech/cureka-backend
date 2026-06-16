import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveProductWizardFields1780512000000 implements MigrationInterface {
  name = 'RemoveProductWizardFields1780512000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "products"
      SET "status" = 'draft'
      WHERE "status" IN ('pending_review', 'rejected')
    `);

    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "rejection_reason"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "creation_step"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "creation_step" integer NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "rejection_reason" text
    `);
  }
}
