import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGokwikCheckoutSetting1780913000000 implements MigrationInterface {
  name = 'AddGokwikCheckoutSetting1780913000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "admin_setting" ("ref_id", "key", "value", "status", "description", "created_by")
      VALUES (
        'SET20260716',
        'gokwikCheckoutEnabled',
        'false',
        'active',
        'Controls whether GoKwik Checkout is used as the storefront checkout UX provider. (true = Enabled, false = Disabled). Priority over Shiprocket when both are enabled.',
        'system'
      )
      ON CONFLICT ("key") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "admin_setting" WHERE "key" = 'gokwikCheckoutEnabled'`);
  }
}
