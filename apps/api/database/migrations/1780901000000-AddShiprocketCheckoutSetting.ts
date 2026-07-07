import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShiprocketCheckoutSetting1780901000000 implements MigrationInterface {
  name = 'AddShiprocketCheckoutSetting1780901000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "admin_setting" ("ref_id", "key", "value", "status", "description", "created_by")
      VALUES (
        'SET20261015',
        'shiprocketCheckoutEnabled',
        'false',
        'active',
        'Controls whether Shiprocket Checkout replaces the legacy storefront payment gateway checkout. (true = Enabled, false = Disabled)',
        'system'
      )
      ON CONFLICT ("key") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "admin_setting" WHERE "key" = 'shiprocketCheckoutEnabled'`);
  }
}
