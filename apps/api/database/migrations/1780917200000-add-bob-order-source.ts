import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBobOrderSource1780917200000 implements MigrationInterface {
  name = 'AddBobOrderSource1780917200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."orders_order_source_enum" ADD VALUE IF NOT EXISTS 'BOB'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot drop a single enum value safely.
  }
}
