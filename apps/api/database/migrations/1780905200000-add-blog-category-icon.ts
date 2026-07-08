import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBlogCategoryIcon1780905200000 implements MigrationInterface {
  name = 'AddBlogCategoryIcon1780905200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "blog_categories"
      ADD COLUMN IF NOT EXISTS "icon" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "blog_categories"
      DROP COLUMN IF EXISTS "icon"
    `);
  }
}
