import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrepaidDiscountToPaymentRequests1780916400000 implements MigrationInterface {
  name = 'AddPrepaidDiscountToPaymentRequests1780916400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_requests"
      ADD COLUMN IF NOT EXISTS "prepaid_discount" numeric(12,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_requests"
      DROP COLUMN IF EXISTS "prepaid_discount"
    `);
  }
}
