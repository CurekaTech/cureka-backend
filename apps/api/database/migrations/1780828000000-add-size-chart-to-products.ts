import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSizeChartToProducts1780828000000 implements MigrationInterface {
  name = 'AddSizeChartToProducts1780828000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN "size_chart" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN "size_chart"
    `);
  }
}
