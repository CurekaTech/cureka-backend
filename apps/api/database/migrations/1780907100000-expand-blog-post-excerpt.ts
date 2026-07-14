import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandBlogPostExcerpt1780907100000 implements MigrationInterface {
  name = 'ExpandBlogPostExcerpt1780907100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "blog_posts"
      ALTER COLUMN "excerpt" TYPE text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "blog_posts"
      ALTER COLUMN "excerpt" TYPE character varying(500)
    `);
  }
}
