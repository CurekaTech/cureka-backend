import { MigrationInterface, QueryRunner } from 'typeorm';

export class CleanupHomeSectionsDedupe1780819000000 implements MigrationInterface {
  name = 'CleanupHomeSectionsDedupe1780819000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "home_sections"
      SET "deleted_at" = NOW()
      WHERE "type" = 'heroBanner' AND "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (PARTITION BY type ORDER BY created_at ASC) AS rn
        FROM "home_sections"
        WHERE "deleted_at" IS NULL
      )
      UPDATE "home_sections"
      SET "deleted_at" = NOW()
      WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_home_sections_type_active"
      ON "home_sections" ("type")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_home_sections_type_active"`);
  }
}
