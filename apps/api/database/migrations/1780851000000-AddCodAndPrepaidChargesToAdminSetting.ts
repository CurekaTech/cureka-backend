import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCodAndPrepaidChargesToAdminSetting1780851000000 implements MigrationInterface {
  name = 'AddCodAndPrepaidChargesToAdminSetting1780851000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "admin_setting" ("ref_id", "key", "value", "status", "description", "created_by")
      VALUES 
        ('SET20261012', 'cod_charge_threshold', '0', 'active', 'Order payable amount threshold (subtotal minus discount) above which COD charge is waived.', 'system'),
        ('SET20261013', 'prepaid_charge', '0', 'active', 'Flat prepaid order charge/discount applied.', 'system'),
        ('SET20261014', 'prepaid_charge_threshold', '0', 'active', 'Order payable amount threshold (subtotal minus discount) above which prepaid charge is waived.', 'system')
      ON CONFLICT ("key") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "admin_setting" WHERE "key" IN ('cod_charge_threshold', 'prepaid_charge', 'prepaid_charge_threshold')
    `);
  }
}
