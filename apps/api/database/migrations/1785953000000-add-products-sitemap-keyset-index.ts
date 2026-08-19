import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductsSitemapKeysetIndex1785953000000 implements MigrationInterface {
  name = 'AddProductsSitemapKeysetIndex1785953000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_products_sitemap_keyset"
      ON "products" ("id")
      WHERE "status" = 'published' AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_sitemap_keyset"`);
  }
}
