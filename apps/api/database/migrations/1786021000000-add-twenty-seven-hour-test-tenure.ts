import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the 27-hour TechBV test interval used to exercise live UPI recurring.
 * Razorpay needs about 25 hours between the pre-debit notice and the debit.
 * Shown only when SUBSCRIPTION_TEST_TENURES_ENABLED=true.
 * PostgreSQL cannot drop enum values safely, so production leaves the flag off.
 */
export class AddTwentySevenHourTestTenure1786021000000 implements MigrationInterface {
  name = 'AddTwentySevenHourTestTenure1786021000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."product_subscription_frequency_enum" ADD VALUE IF NOT EXISTS 'HOURS_27'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."membership_billing_cycle_enum" ADD VALUE IF NOT EXISTS 'HOURS_27'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL enum values cannot be removed safely while rows may use them.
  }
}
