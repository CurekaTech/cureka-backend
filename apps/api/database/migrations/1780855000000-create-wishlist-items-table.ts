import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWishlistItemsTable1780855000000 implements MigrationInterface {
  name = 'CreateWishlistItemsTable1780855000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "wishlist_items" (
        "id"          uuid                                      NOT NULL DEFAULT uuid_generate_v4(),
        "ref_id"      character varying(11)                     NOT NULL,
        "user_id"     uuid                                      NOT NULL,
        "product_id"  uuid                                      NOT NULL,
        "created_by"  character varying(255),
        "updated_by"  character varying(255),
        "created_at"  TIMESTAMPTZ                               NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ                               NOT NULL DEFAULT now(),
        "deleted_at"  TIMESTAMPTZ,
        CONSTRAINT "PK_wishlist_items" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wishlist_items_ref_id" UNIQUE ("ref_id"),
        CONSTRAINT "FK_wishlist_items_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_wishlist_items_product_id" FOREIGN KEY ("product_id")
          REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_wishlist_items_user_id"
      ON "wishlist_items" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_wishlist_items_product_id"
      ON "wishlist_items" ("product_id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_wishlist_items_user_product"
      ON "wishlist_items" ("user_id", "product_id")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_wishlist_items_user_product"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wishlist_items_product_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wishlist_items_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wishlist_items"`);
  }
}
