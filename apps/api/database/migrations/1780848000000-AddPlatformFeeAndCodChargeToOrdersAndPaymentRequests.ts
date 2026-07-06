import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlatformFeeAndCodChargeToOrdersAndPaymentRequests1780848000000 implements MigrationInterface {
  name = 'AddPlatformFeeAndCodChargeToOrdersAndPaymentRequests1780848000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add columns to payment_requests
    await queryRunner.query(`
      ALTER TABLE "payment_requests"
      ADD COLUMN "platform_fee" decimal(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN "cod_charge" decimal(12,2) NOT NULL DEFAULT 0
    `);

    // Add columns to orders
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "platform_fee" decimal(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN "cod_charge" decimal(12,2) NOT NULL DEFAULT 0
    `);

    // Insert settings into admin_setting
    await queryRunner.query(`
      INSERT INTO "admin_setting" ("ref_id", "key", "value", "status", "description", "created_by")
      VALUES
        ('SET20261007', 'platform_fee', '50', 'active', 'Flat platform fee charged on orders.', 'system'),
        ('SET20261008', 'platform_fee_threshold', '900', 'active', 'Order amount threshold above which the platform fee is waived (free).', 'system'),
        ('SET20261009', 'cod_charge', '50', 'active', 'Additional charge applied for Cash on Delivery (COD) orders.', 'system')
      ON CONFLICT ("key") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove settings
    await queryRunner.query(`
      DELETE FROM "admin_setting"
      WHERE "key" IN ('platform_fee', 'platform_fee_threshold', 'cod_charge')
    `);

    // Remove columns from orders
    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN "platform_fee",
      DROP COLUMN "cod_charge"
    `);

    // Remove columns from payment_requests
    await queryRunner.query(`
      ALTER TABLE "payment_requests"
      DROP COLUMN "platform_fee",
      DROP COLUMN "cod_charge"
    `);
  }
}
