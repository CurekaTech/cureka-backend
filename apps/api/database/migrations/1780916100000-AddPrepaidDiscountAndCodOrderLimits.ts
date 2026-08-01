import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrepaidDiscountAndCodOrderLimits1780916100000 implements MigrationInterface {
  name = 'AddPrepaidDiscountAndCodOrderLimits1780916100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "admin_setting" ("ref_id", "key", "value", "status", "description", "created_by")
      VALUES
        (
          'SET20261017',
          'prepaid_discount_percent',
          '2',
          'active',
          'Additional percent discount applied on product line totals when paying with a prepaid method.',
          'system'
        ),
        (
          'SET20261018',
          'cod_min_order_amount',
          '599',
          'active',
          'Minimum order payable amount (subtotal minus coupon discount) required for Cash on Delivery.',
          'system'
        ),
        (
          'SET20261019',
          'cod_max_order_amount',
          '10000',
          'active',
          'Maximum order payable amount (subtotal minus coupon discount) allowed for Cash on Delivery.',
          'system'
        )
      ON CONFLICT ("key") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "admin_setting"
      WHERE "key" IN ('prepaid_discount_percent', 'cod_min_order_amount', 'cod_max_order_amount')
    `);
  }
}
