import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Soft-deleted categories still held a unique index on slug, blocking recreation
 * with the same slug after delete.
 */
export class DropCategoriesSlugUniqueIndex1780504000000 implements MigrationInterface {
  name = 'DropCategoriesSlugUniqueIndex1780504000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_420d9f679d41281f282f5bc7d0"`);
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "UQ_categories_slug"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_420d9f679d41281f282f5bc7d0"
      ON "categories" ("slug")
    `);
  }
}
