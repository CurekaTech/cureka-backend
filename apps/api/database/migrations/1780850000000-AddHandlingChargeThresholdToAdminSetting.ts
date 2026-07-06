import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHandlingChargeThresholdToAdminSetting1780850000000 implements MigrationInterface {
  name = 'AddHandlingChargeThresholdToAdminSetting1780850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "admin_setting" ("ref_id", "key", "value", "status", "description", "created_by")
      VALUES ('SET20261011', 'handling_charge_threshold', '900', 'active', 'Order payable amount threshold (subtotal minus discount) for free handling charge.', 'system')
      ON CONFLICT ("key") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "admin_setting" WHERE "key" = 'handling_charge_threshold'
    `);
  }
}
