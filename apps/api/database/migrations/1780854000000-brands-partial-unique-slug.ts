import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Allows re-creating a brand with the same slug after the previous one was soft-deleted.
 * (Name uniqueness was already relaxed in DropUniqueNameConstraints1780503000000.)
 */
export class BrandsPartialUniqueSlug1780854000000 implements MigrationInterface {
  name = 'BrandsPartialUniqueSlug1780854000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "brands" DROP CONSTRAINT IF EXISTS "UQ_brands_slug"`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_brands_slug_active"`);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_brands_slug_active"
      ON "brands" ("slug")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_brands_slug_active"`);

    await queryRunner.query(
      `ALTER TABLE "brands" ADD CONSTRAINT "UQ_brands_slug" UNIQUE ("slug")`,
    );
  }
}
