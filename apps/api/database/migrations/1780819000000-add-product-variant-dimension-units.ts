import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductVariantDimensionUnits1780819000000 implements MigrationInterface {
  name = 'AddProductVariantDimensionUnits1780819000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN IF NOT EXISTS "weight_unit" character varying(100),
      ADD COLUMN IF NOT EXISTS "length_unit" character varying(100),
      ADD COLUMN IF NOT EXISTS "width_unit" character varying(100),
      ADD COLUMN IF NOT EXISTS "height_unit" character varying(100)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      DROP COLUMN IF EXISTS "height_unit",
      DROP COLUMN IF EXISTS "width_unit",
      DROP COLUMN IF EXISTS "length_unit",
      DROP COLUMN IF EXISTS "weight_unit"
    `);
  }
}
