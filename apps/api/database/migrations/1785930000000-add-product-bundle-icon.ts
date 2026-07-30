import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductBundleIcon1785930000000 implements MigrationInterface {
  name = 'AddProductBundleIcon1785930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "bundle_icon" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "bundle_icon"
    `);
  }
}
