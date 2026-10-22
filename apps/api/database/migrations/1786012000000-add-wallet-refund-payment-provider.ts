import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWalletRefundPaymentProvider1786012000000 implements MigrationInterface {
  name = 'AddWalletRefundPaymentProvider1786012000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."refund_requests_payment_provider_enum"
      ADD VALUE IF NOT EXISTS 'WALLET'
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      'Cannot remove WALLET from refund_requests_payment_provider_enum after it may be referenced by refund rows.',
    );
  }
}
