import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCouponMaxDiscount1780846100000 implements MigrationInterface {
  name = 'AddCouponMaxDiscount1780846100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "coupons"
      ADD COLUMN "max_discount" numeric(12,2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "coupons" DROP COLUMN IF EXISTS "max_discount"`);
  }
}
