import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminSessions1786002000000 implements MigrationInterface {
  name = 'CreateAdminSessions1786002000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "admin_user_id" uuid NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_admin_sessions_admin_user_id" FOREIGN KEY ("admin_user_id")
          REFERENCES "admin_users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_admin_sessions_admin_user_id" ON "admin_sessions" ("admin_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_admin_sessions_expires_at" ON "admin_sessions" ("expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_admin_sessions_expires_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_admin_sessions_admin_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_sessions"`);
  }
}
