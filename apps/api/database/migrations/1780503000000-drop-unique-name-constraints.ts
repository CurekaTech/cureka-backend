import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops unique constraints/indexes on name columns so soft-deleted records
 * do not block re-creating masters with the same name.
 */
export class DropUniqueNameConstraints1780503000000 implements MigrationInterface {
  name = 'DropUniqueNameConstraints1780503000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_attributes_name_unique"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_89afb34fd1fdb2ceb1cea6c57d"`);

    await queryRunner.query(
      `ALTER TABLE "brands" DROP CONSTRAINT IF EXISTS "UQ_brands_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "manufacturers" DROP CONSTRAINT IF EXISTS "UQ_manufacturers_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "health_concerns" DROP CONSTRAINT IF EXISTS "UQ_health_concerns_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "age_groups" DROP CONSTRAINT IF EXISTS "UQ_age_groups_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "countries" DROP CONSTRAINT IF EXISTS "UQ_countries_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "states" DROP CONSTRAINT IF EXISTS "UQ_states_country_name"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."UQ_states_country_id_name"`);
    await queryRunner.query(
      `ALTER TABLE "cities" DROP CONSTRAINT IF EXISTS "UQ_cities_state_name"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."UQ_cities_state_id_name"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_attributes_name_unique"
      ON "attributes" ("name")
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "brands" ADD CONSTRAINT "UQ_brands_name" UNIQUE ("name")`,
    );
    await queryRunner.query(
      `ALTER TABLE "manufacturers" ADD CONSTRAINT "UQ_manufacturers_name" UNIQUE ("name")`,
    );
    await queryRunner.query(
      `ALTER TABLE "health_concerns" ADD CONSTRAINT "UQ_health_concerns_name" UNIQUE ("name")`,
    );
    await queryRunner.query(
      `ALTER TABLE "age_groups" ADD CONSTRAINT "UQ_age_groups_name" UNIQUE ("name")`,
    );
    await queryRunner.query(
      `ALTER TABLE "countries" ADD CONSTRAINT "UQ_countries_name" UNIQUE ("name")`,
    );
    await queryRunner.query(
      `ALTER TABLE "states" ADD CONSTRAINT "UQ_states_country_name" UNIQUE ("country_id", "name")`,
    );
    await queryRunner.query(
      `ALTER TABLE "cities" ADD CONSTRAINT "UQ_cities_state_name" UNIQUE ("state_id", "name")`,
    );
  }
}
