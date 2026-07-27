import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCancelReasonToOrders1780915200000 implements MigrationInterface {
  name = 'AddCancelReasonToOrders1780915200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD COLUMN IF NOT EXISTS "cancel_reason" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
        DROP COLUMN IF EXISTS "cancel_reason"
    `);
  }
}
