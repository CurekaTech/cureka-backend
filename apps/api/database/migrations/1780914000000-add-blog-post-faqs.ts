import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBlogPostFaqs1780914000000 implements MigrationInterface {
  name = 'AddBlogPostFaqs1780914000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "blog_posts"
      ADD COLUMN IF NOT EXISTS "faqs" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "blog_posts"
      DROP COLUMN IF EXISTS "faqs"
    `);
  }
}
