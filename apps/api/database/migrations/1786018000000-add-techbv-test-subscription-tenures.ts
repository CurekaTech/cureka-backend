import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds short billing intervals used only when SUBSCRIPTION_TEST_TENURES_ENABLED=true.
 * Existing monthly, 2-month, quarterly, and yearly values are unchanged.
 * PostgreSQL cannot drop enum values safely, so production simply leaves the flag off.
 */
export class AddTechbvTestSubscriptionTenures1786018000000 implements MigrationInterface {
  name = 'AddTechbvTestSubscriptionTenures1786018000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."product_subscription_frequency_enum" ADD VALUE IF NOT EXISTS 'MINUTES_30'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."product_subscription_frequency_enum" ADD VALUE IF NOT EXISTS 'HOURLY'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."membership_billing_cycle_enum" ADD VALUE IF NOT EXISTS 'MINUTES_30'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."membership_billing_cycle_enum" ADD VALUE IF NOT EXISTS 'HOURLY'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL enum values cannot be removed safely while rows may use them.
  }
}
