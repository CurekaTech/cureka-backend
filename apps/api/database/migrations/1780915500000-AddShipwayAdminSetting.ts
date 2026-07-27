import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShipwayAdminSetting1780915500000 implements MigrationInterface {
  name = 'AddShipwayAdminSetting1780915500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "admin_setting" ("ref_id", "key", "value", "status", "description", "created_by")
      VALUES (
        'SET20261015',
        'shipway',
        '0',
        'inactive',
        'Controls whether Shipway is enabled. (1 = Enabled, 0 = Disabled)',
        'system'
      )
      ON CONFLICT ("key") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "admin_setting" WHERE "key" = 'shipway'`);
  }
}
