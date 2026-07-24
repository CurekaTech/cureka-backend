import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandProductMetaTitle1780915200000 implements MigrationInterface {
  name = 'ExpandProductMetaTitle1780915200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ALTER COLUMN "meta_title" TYPE character varying(500)
    `);

    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ALTER COLUMN "meta_title" TYPE character varying(500)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ALTER COLUMN "meta_title" TYPE character varying(255)
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      ALTER COLUMN "meta_title" TYPE character varying(255)
    `);
  }
}
