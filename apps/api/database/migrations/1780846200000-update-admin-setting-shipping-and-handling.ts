import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateAdminSettingShippingAndHandling1780846200000 implements MigrationInterface {
  name = 'UpdateAdminSettingShippingAndHandling1780846200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "admin_setting"
      SET
        "key" = 'shipping_charge_threshold',
        "description" = 'Order payable amount threshold (subtotal minus discount) for free shipping.'
      WHERE "key" = 'shipping_charge'
    `);

    await queryRunner.query(`
      INSERT INTO "admin_setting" ("ref_id", "key", "value", "status", "description", "created_by")
      SELECT 'SET20261006', 'handling_charge', '50', 'active', 'Flat handling/packaging fee applied to orders.', 'system'
      WHERE NOT EXISTS (
        SELECT 1 FROM "admin_setting" WHERE "key" = 'handling_charge'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "admin_setting" WHERE "key" = 'handling_charge'
    `);

    await queryRunner.query(`
      UPDATE "admin_setting"
      SET
        "key" = 'shipping_charge',
        "description" = 'Default shipping charge applied to eligible orders.'
      WHERE "key" = 'shipping_charge_threshold'
    `);
  }
}
