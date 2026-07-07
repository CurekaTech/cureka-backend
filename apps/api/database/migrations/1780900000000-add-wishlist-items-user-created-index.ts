import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWishlistItemsUserCreatedIndex1780900000000 implements MigrationInterface {
  name = 'AddWishlistItemsUserCreatedIndex1780900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_wishlist_items_user_created_active"
      ON "wishlist_items" ("user_id", "created_at" DESC)
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wishlist_items_user_created_active"`);
  }
}
