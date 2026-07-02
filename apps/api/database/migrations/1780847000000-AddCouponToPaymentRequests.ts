import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCouponToPaymentRequests1780847000000 implements MigrationInterface {
  name = 'AddCouponToPaymentRequests1780847000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_requests"
      ADD COLUMN "coupon_code" varchar(100) NULL,
      ADD COLUMN "coupon_discount" decimal(12,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_requests"
      DROP COLUMN "coupon_code",
      DROP COLUMN "coupon_discount"
    `);
  }
}
