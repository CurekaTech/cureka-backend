import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWatchAndShopItemsTable1780901000000 implements MigrationInterface {
  name = 'CreateWatchAndShopItemsTable1780901000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."watch_and_shop_items_media_type_enum" AS ENUM('video', 'image')
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."watch_and_shop_items_status_enum" AS ENUM('active', 'inactive')
    `);

    await queryRunner.query(`
      CREATE TABLE "watch_and_shop_items" (
        "id"              uuid                                              NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"          character varying(11)                             NOT NULL,
        "title"           character varying(255),
        "media_type"      "public"."watch_and_shop_items_media_type_enum"   NOT NULL DEFAULT 'video',
        "media_url"       character varying(500)                          NOT NULL,
        "product_ref_id"  character varying(11)                             NOT NULL,
        "sort_order"      integer                                           NOT NULL DEFAULT 0,
        "status"          "public"."watch_and_shop_items_status_enum"       NOT NULL DEFAULT 'active',
        "starts_at"       TIMESTAMPTZ,
        "ends_at"         TIMESTAMPTZ,
        "created_by"      character varying(255),
        "updated_by"      character varying(255),
        "created_at"      TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMPTZ                                       NOT NULL DEFAULT now(),
        "deleted_at"      TIMESTAMPTZ,
        CONSTRAINT "PK_watch_and_shop_items"        PRIMARY KEY ("id"),
        CONSTRAINT "UQ_watch_and_shop_items_ref_id" UNIQUE ("ref_id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_watch_and_shop_items_status" ON "watch_and_shop_items" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_watch_and_shop_items_product_ref_id" ON "watch_and_shop_items" ("product_ref_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_watch_and_shop_items_status_sort" ON "watch_and_shop_items" ("status", "sort_order")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_watch_and_shop_items_status_sort"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_watch_and_shop_items_product_ref_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_watch_and_shop_items_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "watch_and_shop_items"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."watch_and_shop_items_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."watch_and_shop_items_media_type_enum"`);
  }
}
