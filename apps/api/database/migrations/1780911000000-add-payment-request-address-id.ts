import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentRequestAddressId1780911000000 implements MigrationInterface {
  name = 'AddPaymentRequestAddressId1780911000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_requests"
      ADD COLUMN IF NOT EXISTS "address_id" uuid
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payment_requests_address_id"
      ON "payment_requests" ("address_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_requests_address_id"`);
    await queryRunner.query(`
      ALTER TABLE "payment_requests"
      DROP COLUMN IF EXISTS "address_id"
    `);
  }
}
