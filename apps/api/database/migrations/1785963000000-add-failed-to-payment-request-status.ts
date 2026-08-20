import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFailedToPaymentRequestStatus1785963000000 implements MigrationInterface {
  name = 'AddFailedToPaymentRequestStatus1785963000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."payment_requests_status_enum"
      ADD VALUE IF NOT EXISTS 'FAILED'
    `);
  }

  public async down(): Promise<void> {
    // Postgres cannot remove a single enum value safely; leave FAILED in place.
  }
}
