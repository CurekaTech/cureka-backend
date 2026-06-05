import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds extended profile fields: avatar, gender, date of birth, marital status.
 */
export class AddUserProfileFields1780700000000 implements MigrationInterface {
  name = 'AddUserProfileFields1780700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."users_gender_enum" AS ENUM('male', 'female', 'other', 'prefer_not_to_say')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_marital_status_enum" AS ENUM('married', 'single', 'divorced', 'widowed')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "profile_image_url" character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "gender" "public"."users_gender_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "date_of_birth" date`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD "marital_status" "public"."users_marital_status_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "marital_status"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "date_of_birth"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "gender"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "profile_image_url"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."users_marital_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."users_gender_enum"`);
  }
}
