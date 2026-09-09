import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVariantEstimatedDeliveryTime1785980600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN IF NOT EXISTS "estimated_delivery_time" character varying(50) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      DROP COLUMN IF EXISTS "estimated_delivery_time"
    `);
  }
}
