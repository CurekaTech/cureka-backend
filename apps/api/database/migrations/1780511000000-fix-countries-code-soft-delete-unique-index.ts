import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Soft-deleted country rows still held UQ_countries_code, so re-creating a country
 * with the same ISO code failed at the DB layer (500) even though existsByCode
 * excludes deleted rows.
 */
export class FixCountriesCodeSoftDeleteUniqueIndex1780511000000
  implements MigrationInterface
{
  name = 'FixCountriesCodeSoftDeleteUniqueIndex1780511000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "countries" DROP CONSTRAINT IF EXISTS "UQ_countries_code"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_countries_code"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_countries_code_active"
      ON "countries" ("code")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_countries_code_active"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_countries_code" ON "countries" ("code")
    `);
    await queryRunner.query(`
      ALTER TABLE "countries"
      ADD CONSTRAINT "UQ_countries_code" UNIQUE ("code")
    `);
  }
}
