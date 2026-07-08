import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVideoUrlToWatchAndShopItems1780902000000 implements MigrationInterface {
  name = 'AddVideoUrlToWatchAndShopItems1780902000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "watch_and_shop_items"
      ADD COLUMN "video_url" character varying(2000)
    `);

    await queryRunner.query(`
      ALTER TABLE "watch_and_shop_items"
      ALTER COLUMN "media_url" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "watch_and_shop_items"
      ALTER COLUMN "media_url" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "watch_and_shop_items"
      DROP COLUMN "video_url"
    `);
  }
}
