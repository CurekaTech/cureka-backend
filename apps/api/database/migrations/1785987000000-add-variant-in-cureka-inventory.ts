import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVariantInCurekaInventory1785987000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN IF NOT EXISTS "in_cureka_inventory" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_variants_in_cureka_inventory"
      ON "product_variants" ("in_cureka_inventory")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_variants_in_cureka_inventory"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "in_cureka_inventory"`,
    );
  }
}
