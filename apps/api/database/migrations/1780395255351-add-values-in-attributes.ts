import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddValuesInAttributes1780395255351 implements MigrationInterface {
  name = 'AddValuesInAttributes1780395255351';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "attributes"
      ADD COLUMN IF NOT EXISTS "values" text[]
    `);

    await queryRunner.query(`
      ALTER TABLE "attributes"
      ALTER COLUMN "data_type" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "attributes"
      ALTER COLUMN "data_type" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "attributes"
      DROP COLUMN IF EXISTS "values"
    `);
  }
}
