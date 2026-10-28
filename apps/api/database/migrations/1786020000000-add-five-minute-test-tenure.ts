import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the 5-minute TechBV test interval.
 * Shown only when SUBSCRIPTION_TEST_TENURES_ENABLED=true.
 * PostgreSQL cannot drop enum values safely, so production leaves the flag off.
 */
export class AddFiveMinuteTestTenure1786020000000 implements MigrationInterface {
  name = 'AddFiveMinuteTestTenure1786020000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."product_subscription_frequency_enum" ADD VALUE IF NOT EXISTS 'MINUTES_5'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."membership_billing_cycle_enum" ADD VALUE IF NOT EXISTS 'MINUTES_5'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL enum values cannot be removed safely while rows may use them.
  }
}
