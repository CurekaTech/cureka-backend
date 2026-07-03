import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrepaidDiscountToOrders1780852000000 implements MigrationInterface {
  name = 'AddPrepaidDiscountToOrders1780852000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "prepaid_discount" decimal(12,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN "prepaid_discount"
    `);
  }
}
