import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Create otp_logs table
 *
 * Stores hashed OTP records for mobile number verification.
 * Indexes: mobile_number, expires_at, is_verified.
 */
export class CreateOtpLogsTable1780501000000 implements MigrationInterface {
  name = 'CreateOtpLogsTable1780501000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create OTP purpose enum
    await queryRunner.query(
      `CREATE TYPE "public"."otp_logs_purpose_enum" AS ENUM('LOGIN', 'REGISTRATION', 'FORGOT_PASSWORD')`,
    );

    // 2. Create otp_logs table
    await queryRunner.query(`
      CREATE TABLE "otp_logs" (
        "id"            uuid                                    NOT NULL DEFAULT uuid_generate_v4(),
        "mobile_number" character varying(20)                  NOT NULL,
        "otp_code"      character varying(255)                  NOT NULL,
        "purpose"       "public"."otp_logs_purpose_enum"        NOT NULL DEFAULT 'LOGIN',
        "expires_at"    TIMESTAMP WITH TIME ZONE                NOT NULL,
        "attempts"      integer                                 NOT NULL DEFAULT 0,
        "is_verified"   boolean                                 NOT NULL DEFAULT false,
        "verified_at"   TIMESTAMP WITH TIME ZONE,
        "created_at"    TIMESTAMP WITH TIME ZONE                NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMP WITH TIME ZONE                NOT NULL DEFAULT now(),
        CONSTRAINT "PK_otp_logs" PRIMARY KEY ("id")
      )
    `);

    // 3. Create indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_otp_logs_mobile_number" ON "otp_logs" ("mobile_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_otp_logs_expires_at" ON "otp_logs" ("expires_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_otp_logs_is_verified" ON "otp_logs" ("is_verified")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_otp_logs_is_verified"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_otp_logs_expires_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_otp_logs_mobile_number"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "otp_logs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."otp_logs_purpose_enum"`);
  }
}
