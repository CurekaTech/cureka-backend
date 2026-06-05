import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Soft-deleted attribute rows still held a full unique index on name, so
 * re-creating an attribute with the same name failed at the DB layer (500)
 * even though application-level existsByName checks exclude deleted rows.
 */
export class FixAttributesNameSoftDeleteUniqueIndex1780502000000
  implements MigrationInterface
{
  name = 'FixAttributesNameSoftDeleteUniqueIndex1780502000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_89afb34fd1fdb2ceb1cea6c57d"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_attributes_name_unique"
      ON "attributes" ("name")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_attributes_name_unique"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_89afb34fd1fdb2ceb1cea6c57d"
      ON "attributes" ("name")
    `);
  }
}
