import { MigrationInterface, QueryRunner } from 'typeorm';

const COLUMNS: Array<{ table: string; column: string }> = [
  { table: 'categories', column: 'image_alt_text' },
  { table: 'categories', column: 'banner_alt_text' },
  { table: 'categories', column: 'faq_banner_alt_text' },
  { table: 'brands', column: 'logo_alt_text' },
  { table: 'brands', column: 'banner_alt_text' },
  { table: 'brands', column: 'featured_banner_alt_text' },
  { table: 'brands', column: 'promotional_banner_alt_text' },
  { table: 'brands', column: 'secondary_banner_alt_text' },
  { table: 'brands', column: 'offer_banner_alt_text' },
  { table: 'brands', column: 'faq_banner_alt_text' },
  { table: 'banners', column: 'image_alt_text' },
  { table: 'blog_posts', column: 'featured_image_alt_text' },
  { table: 'blog_categories', column: 'icon_alt_text' },
  { table: 'support_articles', column: 'featured_image_alt_text' },
  { table: 'health_concerns', column: 'icon_alt_text' },
  { table: 'health_concerns', column: 'banner_alt_text' },
  { table: 'health_concerns', column: 'faq_banner_alt_text' },
  { table: 'wellness_goals', column: 'image_alt_text' },
  { table: 'wellness_goals', column: 'faq_banner_alt_text' },
  { table: 'testimonials', column: 'image_alt_text' },
  { table: 'expert_talk_items', column: 'thumbnail_alt_text' },
  { table: 'manufacturers', column: 'logo_alt_text' },
  { table: 'packers', column: 'logo_alt_text' },
  { table: 'importers', column: 'logo_alt_text' },
  { table: 'products', column: 'bundle_icon_alt_text' },
  { table: 'products', column: 'size_chart_alt_text' },
  { table: 'products', column: 'faq_banner_alt_text' },
  { table: 'product_variants', column: 'size_chart_alt_text' },
];

export class AddCmsImageAltText1786008000000 implements MigrationInterface {
  name = 'AddCmsImageAltText1786008000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { table, column } of COLUMNS) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" character varying(250)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { table, column } of [...COLUMNS].reverse()) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "${column}"`);
    }
  }
}
