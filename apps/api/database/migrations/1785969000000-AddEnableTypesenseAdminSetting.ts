import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEnableTypesenseAdminSetting1785969000000 implements MigrationInterface {
  name = 'AddEnableTypesenseAdminSetting1785969000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "admin_setting" ("ref_id", "key", "value", "status", "description", "created_by")
      VALUES (
        'SET20260827',
        'enableTypesense',
        'false',
        'inactive',
        'Controls whether Typesense powers storefront search. When false, native search fallback is used.',
        'system'
      )
      ON CONFLICT ("key") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "admin_setting" WHERE "key" = 'enableTypesense'`);
  }
}
