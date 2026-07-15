import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHomeSectionSeoFields1780912000000 implements MigrationInterface {
  name = 'AddHomeSectionSeoFields1780912000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "home_sections"
      ADD COLUMN IF NOT EXISTS "page_title" character varying(255),
      ADD COLUMN IF NOT EXISTS "page_description" text,
      ADD COLUMN IF NOT EXISTS "page_canonical_url" character varying(2000)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "home_sections"
      DROP COLUMN IF EXISTS "page_title",
      DROP COLUMN IF EXISTS "page_description",
      DROP COLUMN IF EXISTS "page_canonical_url"
    `);
  }
}
