import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCreatedByColumn1780400000000 implements MigrationInterface {
  name = 'AddCreatedByColumn1780400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = ['users', 'admin_users', 'attributes', 'categories', 'brands'];

    for (const table of tables) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD "created_by" character varying(255)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = ['brands', 'categories', 'attributes', 'admin_users', 'users'];

    for (const table of tables) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "created_by"`);
    }
  }
}
