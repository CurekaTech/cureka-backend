import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShippingHandlingToPaymentRequests1780843000000 implements MigrationInterface {
  name = 'AddShippingHandlingToPaymentRequests1780843000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_requests"
      ADD COLUMN "shipping" decimal(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN "handling" decimal(12,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_requests"
      DROP COLUMN "shipping",
      DROP COLUMN "handling"
    `);
  }
}
