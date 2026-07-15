import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Retires fixed/optional sections from homepage section indexing.
 * CMS modules and hard-coded storefront sections remain; only home_sections rows are soft-deleted.
 */
export class RemoveWatchAndShopHealthReadsHomeSections1780910000000
  implements MigrationInterface
{
  name = 'RemoveWatchAndShopHealthReadsHomeSections1780910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "home_sections"
      SET "deleted_at" = NOW()
      WHERE "type" IN (
        'heroBanner',
        'builtByDoctorsBanner',
        'shopByCategory',
        'bestSellers',
        'expertCuratedBundles',
        'watchAndShop',
        'healthReads'
      )
        AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "home_sections"
      SET "deleted_at" = NULL
      WHERE "type" IN (
        'heroBanner',
        'builtByDoctorsBanner',
        'shopByCategory',
        'bestSellers',
        'expertCuratedBundles',
        'watchAndShop',
        'healthReads'
      )
        AND "deleted_at" IS NOT NULL
    `);
  }
}
