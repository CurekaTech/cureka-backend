import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Distinguishes long-lived login sessions from short-lived GoKwik checkout tokens
 * stored in the same user_sessions table (opaque token + hash pattern).
 */
export class AddUserSessionPurpose1785964000000 implements MigrationInterface {
  name = 'AddUserSessionPurpose1785964000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_sessions"
      ADD COLUMN IF NOT EXISTS "purpose" character varying(32) NOT NULL DEFAULT 'login'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_sessions_purpose"
      ON "user_sessions" ("purpose")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_sessions_purpose"`);
    await queryRunner.query(`
      ALTER TABLE "user_sessions" DROP COLUMN IF EXISTS "purpose"
    `);
  }
}
