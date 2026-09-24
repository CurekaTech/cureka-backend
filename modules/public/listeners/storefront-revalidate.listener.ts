import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import {
  BannerUpdatedEvent,
  BlogPostUpdatedEvent,
  BrandUpdatedEvent,
  CategoryUpdatedEvent,
  CmsPageUpdatedEvent,
  EVENTS,
  HealthConcernUpdatedEvent,
  HomeSectionUpdatedEvent,
  ProductUpdatedEvent,
  WellnessGoalUpdatedEvent,
} from '@packages/events';
import { slugifyForUrl } from '@modules/sitemap/services/sitemap-url.builder';
import {
  buildCategoryPermalink,
  buildProductPermalink,
} from '../utils/category-permalink.util';
import { StorefrontRevalidateService } from '../services/storefront-revalidate.service';

const HOMEPAGE_BANNER_PLACEMENTS = new Set(['hero_primary', 'hero_secondary', 'main_promo']);

@Injectable()
export class StorefrontRevalidateListener {
  private readonly logger = new Logger(StorefrontRevalidateListener.name);

  constructor(
    private readonly revalidate: StorefrontRevalidateService,
    private readonly dataSource: DataSource,
  ) {}

  @OnEvent(EVENTS.PRODUCT_UPDATED)
  async onProductUpdated(event: ProductUpdatedEvent): Promise<void> {
    await this.safe(async () => {
      const row = await this.one<{
        slug: string;
        product_type: string;
        category_slug: string | null;
        sub_slug: string | null;
        sub_sub_slug: string | null;
        sub_sub_sub_slug: string | null;
        product_page_url: string | null;
        variant_slug: string | null;
      }>(
        `
        SELECT p.slug, p.product_type,
               c.slug AS category_slug,
               sc.slug AS sub_slug,
               ssc.slug AS sub_sub_slug,
               sssc.slug AS sub_sub_sub_slug,
               v.product_page_url,
               v.slug AS variant_slug
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN categories sc ON sc.id = p.sub_category_id
        LEFT JOIN categories ssc ON ssc.id = p.sub_sub_category_id
        LEFT JOIN categories sssc ON sssc.id = p.sub_sub_sub_category_id
        LEFT JOIN LATERAL (
          SELECT product_page_url, slug
          FROM product_variants
          WHERE product_id = p.id AND deleted_at IS NULL
          ORDER BY selling_price ASC NULLS LAST
          LIMIT 1
        ) v ON true
        WHERE p.ref_id = $1
        LIMIT 1
        `,
        [event.refId],
      );
      if (!row?.slug) return;

      const categorySlugPath = [
        row.category_slug,
        row.sub_slug,
        row.sub_sub_slug,
        row.sub_sub_sub_slug,
      ].filter((slug): slug is string => Boolean(slug));
      const shopPath = shopPathFor(row.product_page_url, categorySlugPath, row.variant_slug || row.slug);
      const tags = [
        `product:${row.slug}`,
        `product-reviews:${row.slug}`,
        'you-may-also-like',
        'frequently-bought-together',
      ];
      const paths = [shopPath];
      if (categorySlugPath.length) paths.push(buildCategoryPermalink(categorySlugPath));
      if (row.product_type === 'bundle') {
        tags.push('public-bundles', `public-bundle:${row.slug}`);
        paths.push('/');
      }
      await this.revalidate.purge({ tags, paths });
    });
  }

  @OnEvent(EVENTS.CATEGORY_UPDATED)
  async onCategoryUpdated(event: CategoryUpdatedEvent): Promise<void> {
    await this.safe(async () => {
      const rows = await this.many<{ slug: string }>(
        `
        WITH RECURSIVE chain AS (
          SELECT id, parent_category_id, slug, 0 AS depth
          FROM categories
          WHERE ref_id = $1
          UNION ALL
          SELECT c.id, c.parent_category_id, c.slug, chain.depth + 1
          FROM categories c
          INNER JOIN chain ON c.id = chain.parent_category_id
          WHERE chain.depth < 8
        )
        SELECT slug FROM chain ORDER BY depth DESC
        `,
        [event.refId],
      );
      const slugPath = rows.map((row) => row.slug).filter(Boolean);
      const leaf = slugPath[slugPath.length - 1];
      const tags = ['category-header', 'category-browse', 'product-filters', 'product-filter-brands'];
      if (leaf) tags.unshift(`category-products:${leaf}`);
      const paths = ['/'];
      if (slugPath.length) paths.push(buildCategoryPermalink(slugPath));
      await this.revalidate.purge({ tags, paths });
    });
  }

  @OnEvent(EVENTS.BRAND_UPDATED)
  async onBrandUpdated(event: BrandUpdatedEvent): Promise<void> {
    await this.safe(async () => {
      const row = await this.one<{ slug: string }>(
        `SELECT slug FROM brands WHERE ref_id = $1 LIMIT 1`,
        [event.refId],
      );
      if (!row?.slug) return;
      await this.revalidate.purge({
        tags: [`brand-products:${row.slug}`, 'public-master-brands'],
        paths: [`/product-brands/${row.slug}`],
      });
    });
  }

  @OnEvent(EVENTS.HEALTH_CONCERN_UPDATED)
  async onHealthConcernUpdated(event: HealthConcernUpdatedEvent): Promise<void> {
    await this.safe(async () => {
      const row = await this.one<{ slug: string }>(
        `SELECT slug FROM health_concerns WHERE ref_id = $1 LIMIT 1`,
        [event.refId],
      );
      if (!row?.slug) return;
      await this.revalidate.purge({
        tags: [`health-concern-products:${row.slug}`, 'homepage-health-concerns'],
        paths: [`/health-concerns/${row.slug}`],
      });
    });
  }

  @OnEvent(EVENTS.WELLNESS_GOAL_UPDATED)
  async onWellnessGoalUpdated(event: WellnessGoalUpdatedEvent): Promise<void> {
    await this.safe(async () => {
      const row = await this.one<{ ref_id: string; name: string }>(
        `SELECT ref_id, name FROM wellness_goals WHERE ref_id = $1 LIMIT 1`,
        [event.refId],
      );
      if (!row) return;
      const slug = slugifyForUrl(row.name);
      await this.revalidate.purge({
        tags: [`wellness-goal-products:${row.ref_id}`, 'homepage-wellness-goals-view-all'],
        paths: slug ? [`/wellness-goals/${slug}`] : [],
      });
    });
  }

  @OnEvent(EVENTS.HOME_SECTION_UPDATED)
  async onHomeSectionUpdated(event: HomeSectionUpdatedEvent): Promise<void> {
    await this.safe(async () => {
      const row = await this.one<{ slug: string }>(
        `SELECT slug FROM home_sections WHERE ref_id = $1 LIMIT 1`,
        [event.refId],
      );
      const tags = ['homepage-sections', 'homepage-banners'];
      const paths = ['/'];
      if (row?.slug) {
        tags.push(`home-section-${row.slug}`);
        paths.push(`/collections/${row.slug}`);
      }
      await this.revalidate.purge({ tags, paths });
    });
  }

  @OnEvent(EVENTS.BANNER_UPDATED)
  async onBannerUpdated(event: BannerUpdatedEvent): Promise<void> {
    await this.safe(async () => {
      const row = await this.one<{ placement: string }>(
        `SELECT placement FROM banners WHERE ref_id = $1 LIMIT 1`,
        [event.refId],
      );
      if (!row || !HOMEPAGE_BANNER_PLACEMENTS.has(row.placement)) return;
      await this.revalidate.purge({
        tags: ['homepage-banners', 'homepage-sections'],
        paths: ['/'],
      });
    });
  }

  @OnEvent(EVENTS.BLOG_POST_UPDATED)
  async onBlogPostUpdated(event: BlogPostUpdatedEvent): Promise<void> {
    await this.safe(async () => {
      const row = await this.one<{ slug: string }>(
        `SELECT slug FROM blog_posts WHERE ref_id = $1 LIMIT 1`,
        [event.refId],
      );
      if (!row?.slug) return;
      await this.revalidate.purge({
        tags: [`blog-post:${row.slug}`, 'blog-posts'],
        paths: [`/${row.slug}`],
      });
    });
  }

  @OnEvent(EVENTS.CMS_PAGE_UPDATED)
  async onCmsPageUpdated(_event: CmsPageUpdatedEvent): Promise<void> {
    await this.safe(async () => {
      await this.revalidate.purge({ tags: ['footer-nav'], paths: ['/'] });
    });
  }

  private async safe(work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.warn(
        `Storefront revalidate lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async one<T>(sql: string, params: unknown[]): Promise<T | undefined> {
    const rows = await this.dataSource.query(sql, params);
    return (rows as T[])[0];
  }

  private async many<T>(sql: string, params: unknown[]): Promise<T[]> {
    return this.dataSource.query(sql, params);
  }
}

const shopPathFor = (
  productPageUrl: string | null,
  categorySlugPath: string[],
  slug: string,
): string => {
  const stored = productPageUrl?.trim();
  if (stored?.startsWith('/')) return stored.split('?')[0] || stored;
  return buildProductPermalink(categorySlugPath, slug);
};
