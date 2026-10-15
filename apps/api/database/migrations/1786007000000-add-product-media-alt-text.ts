import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductMediaAltText1786007000000 implements MigrationInterface {
  name = 'AddProductMediaAltText1786007000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_media"
      ADD COLUMN IF NOT EXISTS "alt_text" character varying(250)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_media" DROP COLUMN IF EXISTS "alt_text"
    `);
  }
}
