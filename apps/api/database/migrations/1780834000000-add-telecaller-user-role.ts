import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTelecallerUserRole1780834000000 implements MigrationInterface {
  name = 'AddTelecallerUserRole1780834000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."users_role_enum" ADD VALUE IF NOT EXISTS 'telecaller'
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values safely.
  }
}
