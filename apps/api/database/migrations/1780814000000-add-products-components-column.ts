import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductsComponentsColumn1780814000000 implements MigrationInterface {
  name = 'AddProductsComponentsColumn1780814000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "components" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "components"`);
  }
}
