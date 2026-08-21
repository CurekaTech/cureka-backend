import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBrandOfferBanner1785966000000 implements MigrationInterface {
  name = 'AddBrandOfferBanner1785966000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "brands"
      ADD COLUMN IF NOT EXISTS "offer_banner" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "brands"
      DROP COLUMN IF EXISTS "offer_banner"
    `);
  }
}
