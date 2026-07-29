import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductCuratedFields1780915800000 implements MigrationInterface {
  name = 'AddProductCuratedFields1780915800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "curated_by" character varying(500),
      ADD COLUMN IF NOT EXISTS "curated_for" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "curated_for",
      DROP COLUMN IF EXISTS "curated_by"
    `);
  }
}
