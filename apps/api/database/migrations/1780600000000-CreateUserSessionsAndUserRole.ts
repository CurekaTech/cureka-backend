import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: user_sessions table + users.role column
 *
 * Supports JWT access token (short-lived) + refresh session (long-lived) strategy.
 */
export class CreateUserSessionsAndUserRole1780600000000 implements MigrationInterface {
  name = 'CreateUserSessionsAndUserRole1780600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."users_role_enum" AS ENUM(
        'customer',
        'vendor',
        'vendor_manager',
        'warehouse_staff',
        'delivery_partner'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "role" "public"."users_role_enum" NOT NULL DEFAULT 'customer'
    `);

    await queryRunner.query(`CREATE INDEX "IDX_users_role" ON "users" ("role")`);

    await queryRunner.query(`
      CREATE TABLE "user_sessions" (
        "id"                  uuid                     NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"             uuid                     NOT NULL,
        "refresh_token_hash"  character varying(64)    NOT NULL,
        "device_id"           character varying(64)    NOT NULL,
        "device_name"         character varying(120),
        "browser"             character varying(80),
        "os"                  character varying(80),
        "ip_address"          character varying(45),
        "last_activity"       TIMESTAMP WITH TIME ZONE NOT NULL,
        "expires_at"          TIMESTAMP WITH TIME ZONE NOT NULL,
        "is_revoked"          boolean                  NOT NULL DEFAULT false,
        "revoked_at"          TIMESTAMP WITH TIME ZONE,
        "created_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_sessions_refresh_token_hash" UNIQUE ("refresh_token_hash"),
        CONSTRAINT "FK_user_sessions_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_user_sessions_user_id" ON "user_sessions" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_sessions_device_id" ON "user_sessions" ("device_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_sessions_last_activity" ON "user_sessions" ("last_activity")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_sessions_expires_at" ON "user_sessions" ("expires_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_sessions_is_revoked" ON "user_sessions" ("is_revoked")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_sessions_is_revoked"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_sessions_expires_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_sessions_last_activity"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_sessions_device_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_sessions_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_sessions"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_role"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "role"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."users_role_enum"`);
  }
}
