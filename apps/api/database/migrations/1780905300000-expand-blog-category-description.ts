import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandBlogCategoryDescription1780905300000 implements MigrationInterface {
  name = 'ExpandBlogCategoryDescription1780905300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "blog_categories"
      ALTER COLUMN "description" TYPE text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "blog_categories"
      ALTER COLUMN "description" TYPE character varying(500)
    `);
  }
}
