import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShippingChargeToAdminSetting1780845000000 implements MigrationInterface {
  name = 'AddShippingChargeToAdminSetting1780845000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "admin_setting" ("ref_id", "key", "value", "status", "description", "created_by")
      VALUES ('SET20261005', 'shipping_charge', '900', 'active', 'Default shipping charge applied to eligible orders.', 'system')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "admin_setting" WHERE "key" = 'shipping_charge'
    `);
  }
}
