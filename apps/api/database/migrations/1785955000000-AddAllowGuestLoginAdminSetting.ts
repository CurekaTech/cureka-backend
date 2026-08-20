import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAllowGuestLoginAdminSetting1785955000000 implements MigrationInterface {
  name = 'AddAllowGuestLoginAdminSetting1785955000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "admin_setting" ("ref_id", "key", "value", "status", "description", "created_by")
      VALUES (
        'SET20260820',
        'allowGuestLogin',
        'false',
        'inactive',
        'Controls whether guest login is allowed on storefront.',
        'system'
      )
      ON CONFLICT ("key") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "admin_setting" WHERE "key" = 'allowGuestLogin'`);
  }
}
