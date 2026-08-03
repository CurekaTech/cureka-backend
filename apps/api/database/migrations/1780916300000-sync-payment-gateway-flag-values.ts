import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin UI often toggled only `status` for razor_pay / cash_free / pay_you / shipway,
 * leaving value stuck at "0". Align value with status so gateway resolvers and admin agree.
 */
export class SyncPaymentGatewayFlagValues1780916300000 implements MigrationInterface {
  name = 'SyncPaymentGatewayFlagValues1780916300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "admin_setting"
      SET "value" = '1', "updated_at" = NOW()
      WHERE "key" IN ('razor_pay', 'cash_free', 'pay_you', 'shipway')
        AND "status" = 'active'
        AND TRIM(LOWER("value")) NOT IN ('1', 'true', 'yes', 'on')
    `);

    await queryRunner.query(`
      UPDATE "admin_setting"
      SET "value" = '0', "updated_at" = NOW()
      WHERE "key" IN ('razor_pay', 'cash_free', 'pay_you', 'shipway')
        AND "status" = 'inactive'
        AND TRIM(LOWER("value")) IN ('1', 'true', 'yes', 'on')
    `);
  }

  public async down(): Promise<void> {
    // Irreversible data heal — no-op.
  }
}
