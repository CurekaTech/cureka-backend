import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPromotionalPageType1786013000000 implements MigrationInterface {
  name = 'AddPromotionalPageType1786013000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "promotional_pages_promotion_type_enum" AS ENUM ('default', 'month-end');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "promotional_pages"
      ADD COLUMN IF NOT EXISTS "promotion_type" "promotional_pages_promotion_type_enum" NOT NULL DEFAULT 'default'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "promotional_pages" DROP COLUMN IF EXISTS "promotion_type"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "promotional_pages_promotion_type_enum"
    `);
  }
}
