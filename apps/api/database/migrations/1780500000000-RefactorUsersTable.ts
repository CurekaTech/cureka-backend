import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Refactor users table
 *
 * Changes:
 *   - Drop old columns: full_name, password, gender, dob, is_active, phone
 *   - Drop old enum:    users_gender_enum
 *   - Add new columns:  first_name, last_name, mobile_number, is_guest, is_registered, status
 *   - Create enum:      users_status_enum (ACTIVE | INACTIVE)
 *   - Adjust email:     make nullable, preserve existing unique index
 *   - Add indexes:      mobile_number (unique, partial), status
 */
export class RefactorUsersTable1780500000000 implements MigrationInterface {
  name = 'RefactorUsersTable1780500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create new status enum
    await queryRunner.query(
      `CREATE TYPE "public"."users_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`,
    );

    // 2. Drop old gender enum usage and column
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "gender"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."users_gender_enum"`,
    );

    // 3. Drop other removed columns
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "full_name"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "password"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "dob"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "is_active"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "phone"`);

    // 4. Make email nullable (previously NOT NULL)
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL`,
    );

    // 5. Drop old non-partial unique index on email; replace with partial unique index
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_97672ac88f789774dd47f7c8be"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_users_email_unique" ON "users" ("email") WHERE "email" IS NOT NULL`,
    );

    // 6. Add new columns
    await queryRunner.query(
      `ALTER TABLE "users" ADD "first_name" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "last_name" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "mobile_number" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "is_guest" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "is_registered" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "status" "public"."users_status_enum" NOT NULL DEFAULT 'ACTIVE'`,
    );

    // 7. Create indexes
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_users_mobile_number_unique" ON "users" ("mobile_number") WHERE "mobile_number" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_users_status" ON "users" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse: drop new indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_users_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_users_mobile_number_unique"`);

    // Drop new columns
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "status"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "is_registered"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "is_guest"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "mobile_number"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "last_name"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "first_name"`);

    // Drop new status enum
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."users_status_enum"`);

    // Restore email to NOT NULL (may fail if null values exist — acceptable for rollback)
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_users_email_unique"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email")`,
    );

    // Restore removed columns
    await queryRunner.query(
      `ALTER TABLE "users" ADD "is_active" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "dob" date`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD "password" character varying(255) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "phone" character varying(20)`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD "full_name" character varying(255) NOT NULL DEFAULT ''`,
    );

    // Restore gender enum and column
    await queryRunner.query(
      `CREATE TYPE "public"."users_gender_enum" AS ENUM('male', 'female', 'other', 'prefer_not_to_say')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "gender" "public"."users_gender_enum"`,
    );
  }
}
