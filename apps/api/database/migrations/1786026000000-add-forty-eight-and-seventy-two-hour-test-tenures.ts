import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds 48h / 72h TechBV test intervals for Cashfree AutoPay E2E:
 * - HOURS_48: UPI (exact +48h → Kolkata T+2 CHARGE window)
 * - HOURS_72: Card (exact +72h → Kolkata T+2…T+3 CHARGE window)
 * Shown only when SUBSCRIPTION_TEST_TENURES_ENABLED=true.
 * PostgreSQL cannot drop enum values safely, so production leaves the flag off.
 */
export class AddFortyEightAndSeventyTwoHourTestTenures1786026000000
  implements MigrationInterface
{
  name = 'AddFortyEightAndSeventyTwoHourTestTenures1786026000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."product_subscription_frequency_enum" ADD VALUE IF NOT EXISTS 'HOURS_48'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."product_subscription_frequency_enum" ADD VALUE IF NOT EXISTS 'HOURS_72'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."membership_billing_cycle_enum" ADD VALUE IF NOT EXISTS 'HOURS_48'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."membership_billing_cycle_enum" ADD VALUE IF NOT EXISTS 'HOURS_72'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL enum values cannot be removed safely while rows may use them.
  }
}
