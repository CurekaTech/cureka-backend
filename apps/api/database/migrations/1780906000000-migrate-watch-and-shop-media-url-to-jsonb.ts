import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateWatchAndShopMediaUrlToJsonb1780906000000 implements MigrationInterface {
  name = 'MigrateWatchAndShopMediaUrlToJsonb1780906000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const column = await queryRunner.query(`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'watch_and_shop_items'
        AND column_name = 'media_url'
    `);

    const dataType = column?.[0]?.data_type as string | undefined;
    if (dataType === 'jsonb') {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "watch_and_shop_items"
      ADD COLUMN "media_url_jsonb_tmp" jsonb
    `);

    await queryRunner.query(`
      UPDATE "watch_and_shop_items"
      SET "media_url_jsonb_tmp" = CASE
        WHEN "media_url" IS NULL OR TRIM("media_url") = '' THEN NULL
        WHEN TRIM("media_url") ~ '^\\s*\\{' THEN TRIM("media_url")::jsonb
        ELSE jsonb_build_object(
          'key',
          regexp_replace(
            regexp_replace(
              regexp_replace(TRIM("media_url"), '^/uploads/', ''),
              '^uploads/', ''
            ),
            '\\?.*$', ''
          ),
          'name', 'local'
        )
      END
    `);

    await queryRunner.query(`ALTER TABLE "watch_and_shop_items" DROP COLUMN "media_url"`);
    await queryRunner.query(`
      ALTER TABLE "watch_and_shop_items"
      RENAME COLUMN "media_url_jsonb_tmp" TO "media_url"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const column = await queryRunner.query(`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'watch_and_shop_items'
        AND column_name = 'media_url'
    `);

    const dataType = column?.[0]?.data_type as string | undefined;
    if (dataType !== 'jsonb') {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "watch_and_shop_items"
      ADD COLUMN "media_url_varchar_tmp" character varying(500)
    `);

    await queryRunner.query(`
      UPDATE "watch_and_shop_items"
      SET "media_url_varchar_tmp" = CASE
        WHEN "media_url" IS NULL THEN NULL
        ELSE COALESCE("media_url"->>'key', "media_url"::text)
      END
    `);

    await queryRunner.query(`ALTER TABLE "watch_and_shop_items" DROP COLUMN "media_url"`);
    await queryRunner.query(`
      ALTER TABLE "watch_and_shop_items"
      RENAME COLUMN "media_url_varchar_tmp" TO "media_url"
    `);
  }
}
