import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDailySubscriptionCycles1786017000000 implements MigrationInterface {
  name = 'AddDailySubscriptionCycles1786017000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "public"."product_subscription_frequency_enum" ADD VALUE IF NOT EXISTS 'DAILY'`);
    await queryRunner.query(`ALTER TYPE "public"."membership_billing_cycle_enum" ADD VALUE IF NOT EXISTS 'DAILY'`);
  }

  public async down(): Promise<void> {
    // PostgreSQL enum values cannot be removed safely while rows may use them.
  }
}
