import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameMothersDayToFestivalBanners1780821000001 implements MigrationInterface {
  name = 'RenameMothersDayToFestivalBanners1780821000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "home_sections"
      SET
        "type" = 'festivalBanners',
        "title" = 'Festival Banners',
        "slug" = 'festival-banners'
      WHERE "type" = 'mothersDayBanner' AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "home_sections"
      SET
        "type" = 'mothersDayBanner',
        "title" = 'Mothers Day Banner',
        "slug" = 'mothers-day-banner'
      WHERE "type" = 'festivalBanners' AND "deleted_at" IS NULL
    `);
  }
}
