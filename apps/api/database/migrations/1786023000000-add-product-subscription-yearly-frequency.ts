import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Product subscriptions already document monthly / 2-month / quarterly.
 * YEARLY matches membership and the Subscribe & Save business requirement.
 */
export class AddProductSubscriptionYearlyFrequency1786023000000 implements MigrationInterface {
  name = 'AddProductSubscriptionYearlyFrequency1786023000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."product_subscription_frequency_enum" ADD VALUE IF NOT EXISTS 'YEARLY'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot drop a single enum value safely while rows may use it.
  }
}
