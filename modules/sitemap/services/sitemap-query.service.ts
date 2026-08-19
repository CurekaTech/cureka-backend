import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrandEntity } from '@modules/master/entities/brand.entity';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { HealthConcernEntity } from '@modules/master/entities/health-concern.entity';
import { WellnessGoalEntity } from '@modules/master/entities/wellness-goal.entity';
import { HomeSectionEntity } from '@modules/master/entities/home-section.entity';
import { BlogPostEntity } from '@modules/master/entities/blog-post.entity';
import { SupportArticleEntity } from '@modules/master/entities/support-article.entity';
import { CmsPageEntity } from '@modules/master/entities/cms-page.entity';
import { HomeSectionType } from '@modules/master/enums/home-section-type.enum';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { BlogPostStatus } from '@modules/master/enums/blog-post-status.enum';
import { BlogPostVisibility } from '@modules/master/enums/blog-post-visibility.enum';
import { SupportContentStatus } from '@modules/master/enums/support-content-status.enum';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { SITEMAP_STATIC_URLS } from '../config/static-urls';
import {
  SitemapUrlEntry,
  buildBlogLocPath,
  buildBrandLocPath,
  buildCategoryLocPath,
  buildCmsLocPath,
  buildCollectionLocPath,
  buildHealthConcernLocPath,
  buildProductLocPaths,
  buildSupportLocPath,
  buildWellnessGoalLocPath,
  dedupeUrlEntries,
} from './sitemap-url.builder';

type CategoryNode = { id: string; slug: string; parentId: string | null };

const rawString = (row: Record<string, unknown>, ...keys: string[]): string | null => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
};

@Injectable()
export class SitemapQueryService {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly productsRepo: Repository<ProductEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoriesRepo: Repository<CategoryEntity>,
    @InjectRepository(BrandEntity)
    private readonly brandsRepo: Repository<BrandEntity>,
    @InjectRepository(HealthConcernEntity)
    private readonly healthConcernsRepo: Repository<HealthConcernEntity>,
    @InjectRepository(WellnessGoalEntity)
    private readonly wellnessGoalsRepo: Repository<WellnessGoalEntity>,
    @InjectRepository(HomeSectionEntity)
    private readonly homeSectionsRepo: Repository<HomeSectionEntity>,
    @InjectRepository(BlogPostEntity)
    private readonly blogPostsRepo: Repository<BlogPostEntity>,
    @InjectRepository(SupportArticleEntity)
    private readonly supportArticlesRepo: Repository<SupportArticleEntity>,
    @InjectRepository(CmsPageEntity)
    private readonly cmsPagesRepo: Repository<CmsPageEntity>,
  ) {}

  getStaticEntries(): SitemapUrlEntry[] {
    return SITEMAP_STATIC_URLS.map((item) => ({ locPath: item.path }));
  }

  async loadCategoryNodes(): Promise<Map<string, CategoryNode>> {
    const rows = await this.categoriesRepo
      .createQueryBuilder('category')
      .select(['category.id', 'category.slug', 'category.parentCategoryId'])
      .where('category.status = :status', { status: MasterStatus.ACTIVE })
      .getMany();

    return new Map(
      rows.map((row) => [
        row.id,
        { id: row.id, slug: row.slug, parentId: row.parentCategoryId },
      ]),
    );
  }

  categorySlugPath(nodes: Map<string, CategoryNode>, categoryId: string | null | undefined): string[] {
    if (!categoryId) return [];
    const slugs: string[] = [];
    const seen = new Set<string>();
    let current = nodes.get(categoryId);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      if (current.slug?.trim()) slugs.unshift(current.slug.trim());
      current = current.parentId ? nodes.get(current.parentId) : undefined;
    }
    return slugs;
  }

  async *iterateProductEntries(batchSize: number): AsyncGenerator<SitemapUrlEntry> {
    const nodes = await this.loadCategoryNodes();
    let lastId = '';
    const seenLocs = new Set<string>();

    while (true) {
      const qb = this.productsRepo
        .createQueryBuilder('product')
        .select([
          'product.id',
          'product.slug',
          'product.updatedAt',
          'product.categoryId',
          'product.subCategoryId',
          'product.subSubCategoryId',
          'product.subSubSubCategoryId',
          'product.singleProductUrl',
        ])
        .addSelect(
          `(SELECT pv.product_page_url FROM product_variants pv
            WHERE pv.product_id = product.id
              AND pv.deleted_at IS NULL
              AND pv.status = :variantStatus
              AND pv.product_page_url IS NOT NULL
              AND btrim(pv.product_page_url) <> ''
            ORDER BY pv.product_page_url
            LIMIT 1)`,
          'product_page_url',
        )
        .where('product.status = :status', { status: ProductStatus.PUBLISHED })
        .andWhere(
          `EXISTS (
            SELECT 1 FROM product_variants pv
            WHERE pv.product_id = product.id
              AND pv.deleted_at IS NULL
              AND pv.status = :variantStatus
          )`,
        )
        .setParameter('variantStatus', VariantStatus.ACTIVE)
        .orderBy('product.id', 'ASC')
        .take(batchSize);

      if (lastId) {
        qb.andWhere('product.id > :lastId', { lastId });
      }

      const { entities, raw } = await qb.getRawAndEntities();
      if (!entities.length) break;

      for (let index = 0; index < entities.length; index += 1) {
        const product = entities[index];
        lastId = product.id;
        const rawRow = (raw[index] ?? {}) as Record<string, unknown>;
        const deepestCategoryId =
          product.subSubSubCategoryId ||
          product.subSubCategoryId ||
          product.subCategoryId ||
          product.categoryId;
        const locPaths = buildProductLocPaths({
          slug: product.slug,
          productPageUrl: rawString(rawRow, 'product_page_url', 'productPageUrl', 'productpageurl'),
          singleProductUrl: product.singleProductUrl,
          categorySlugPath: this.categorySlugPath(nodes, deepestCategoryId),
        });
        const lastmod = product.updatedAt ?? null;
        for (const locPath of locPaths) {
          if (seenLocs.has(locPath)) continue;
          seenLocs.add(locPath);
          yield { locPath, lastmod };
        }
      }

      if (entities.length < batchSize) break;
    }
  }

  async collectCategoryEntries(batchSize: number): Promise<SitemapUrlEntry[]> {
    const nodes = await this.loadCategoryNodes();
    const entries: SitemapUrlEntry[] = [];
    let lastId = '';

    while (true) {
      const qb = this.categoriesRepo
        .createQueryBuilder('category')
        .select(['category.id', 'category.slug', 'category.updatedAt'])
        .where('category.status = :status', { status: MasterStatus.ACTIVE })
        .orderBy('category.id', 'ASC')
        .take(batchSize);
      if (lastId) qb.andWhere('category.id > :lastId', { lastId });
      const rows = await qb.getMany();
      if (!rows.length) break;
      for (const row of rows) {
        lastId = row.id;
        const locPath = buildCategoryLocPath(this.categorySlugPath(nodes, row.id));
        if (!locPath) continue;
        entries.push({ locPath, lastmod: row.updatedAt });
      }
      if (rows.length < batchSize) break;
    }

    return dedupeUrlEntries(entries);
  }

  async collectBrandEntries(batchSize: number): Promise<SitemapUrlEntry[]> {
    return this.collectSimple({
      repo: this.brandsRepo,
      alias: 'brand',
      batchSize,
      status: MasterStatus.ACTIVE,
      toEntry: (row) => {
        const locPath = buildBrandLocPath(row.slug);
        return locPath ? { locPath, lastmod: row.updatedAt } : null;
      },
    });
  }

  async collectHealthConcernEntries(batchSize: number): Promise<SitemapUrlEntry[]> {
    return this.collectSimple({
      repo: this.healthConcernsRepo,
      alias: 'healthConcern',
      batchSize,
      status: MasterStatus.ACTIVE,
      toEntry: (row) => {
        const locPath = buildHealthConcernLocPath(row.slug);
        return locPath ? { locPath, lastmod: row.updatedAt } : null;
      },
    });
  }

  async collectWellnessGoalEntries(batchSize: number): Promise<SitemapUrlEntry[]> {
    const entries: SitemapUrlEntry[] = [];
    let lastId = '';
    while (true) {
      const qb = this.wellnessGoalsRepo
        .createQueryBuilder('wellnessGoal')
        .select(['wellnessGoal.id', 'wellnessGoal.name', 'wellnessGoal.updatedAt'])
        .where('wellnessGoal.status = :status', { status: MasterStatus.ACTIVE })
        .orderBy('wellnessGoal.id', 'ASC')
        .take(batchSize);
      if (lastId) qb.andWhere('wellnessGoal.id > :lastId', { lastId });
      const rows = await qb.getMany();
      if (!rows.length) break;
      for (const row of rows) {
        lastId = row.id;
        const locPath = buildWellnessGoalLocPath(row.name);
        if (!locPath) continue;
        entries.push({ locPath, lastmod: row.updatedAt });
      }
      if (rows.length < batchSize) break;
    }
    return dedupeUrlEntries(entries);
  }

  async collectCollectionEntries(batchSize: number): Promise<SitemapUrlEntry[]> {
    const entries: SitemapUrlEntry[] = [];
    let lastId = '';
    while (true) {
      const qb = this.homeSectionsRepo
        .createQueryBuilder('section')
        .select(['section.id', 'section.slug', 'section.updatedAt'])
        .where('section.status = :status', { status: MasterStatus.ACTIVE })
        .andWhere('section.type = :type', { type: HomeSectionType.PRODUCT_SLIDER })
        .orderBy('section.id', 'ASC')
        .take(batchSize);
      if (lastId) qb.andWhere('section.id > :lastId', { lastId });
      const rows = await qb.getMany();
      if (!rows.length) break;
      for (const row of rows) {
        lastId = row.id;
        const locPath = buildCollectionLocPath(row.slug);
        if (!locPath) continue;
        entries.push({ locPath, lastmod: row.updatedAt });
      }
      if (rows.length < batchSize) break;
    }
    return dedupeUrlEntries(entries);
  }

  async collectBlogEntries(batchSize: number): Promise<SitemapUrlEntry[]> {
    const entries: SitemapUrlEntry[] = [];
    let lastId = '';
    while (true) {
      const qb = this.blogPostsRepo
        .createQueryBuilder('post')
        .select(['post.id', 'post.slug', 'post.updatedAt'])
        .where('post.status = :status', { status: BlogPostStatus.PUBLISHED })
        .andWhere('post.visibility = :visibility', { visibility: BlogPostVisibility.PUBLIC })
        .orderBy('post.id', 'ASC')
        .take(batchSize);
      if (lastId) qb.andWhere('post.id > :lastId', { lastId });
      const rows = await qb.getMany();
      if (!rows.length) break;
      for (const row of rows) {
        lastId = row.id;
        const locPath = buildBlogLocPath(row.slug);
        if (!locPath) continue;
        entries.push({ locPath, lastmod: row.updatedAt });
      }
      if (rows.length < batchSize) break;
    }
    return dedupeUrlEntries(entries);
  }

  async collectSupportEntries(batchSize: number): Promise<SitemapUrlEntry[]> {
    return this.collectSimple({
      repo: this.supportArticlesRepo,
      alias: 'article',
      batchSize,
      status: SupportContentStatus.ACTIVE,
      toEntry: (row) => {
        const locPath = buildSupportLocPath(row.slug);
        return locPath ? { locPath, lastmod: row.updatedAt } : null;
      },
    });
  }

  async collectCmsEntries(batchSize: number): Promise<SitemapUrlEntry[]> {
    return this.collectSimple({
      repo: this.cmsPagesRepo,
      alias: 'page',
      batchSize,
      status: MasterStatus.ACTIVE,
      toEntry: (row) => {
        const locPath = buildCmsLocPath(row.slug);
        return locPath ? { locPath, lastmod: row.updatedAt } : null;
      },
    });
  }

  private async collectSimple<T extends { id: string; slug?: string; name?: string; updatedAt: Date }>(options: {
    repo: Repository<T>;
    alias: string;
    batchSize: number;
    status: string;
    extraSelect?: string[];
    toEntry: (row: T) => SitemapUrlEntry | null;
  }): Promise<SitemapUrlEntry[]> {
    const entries: SitemapUrlEntry[] = [];
    let lastId = '';
    const select = [
      `${options.alias}.id`,
      `${options.alias}.slug`,
      `${options.alias}.updatedAt`,
      ...(options.extraSelect ?? []).map((field) => `${options.alias}.${field}`),
    ];

    while (true) {
      const qb = options.repo
        .createQueryBuilder(options.alias)
        .select(select)
        .where(`${options.alias}.status = :status`, { status: options.status })
        .orderBy(`${options.alias}.id`, 'ASC')
        .take(options.batchSize);
      if (lastId) qb.andWhere(`${options.alias}.id > :lastId`, { lastId });
      const rows = await qb.getMany();
      if (!rows.length) break;
      for (const row of rows) {
        lastId = row.id;
        const entry = options.toEntry(row);
        if (entry) entries.push(entry);
      }
      if (rows.length < options.batchSize) break;
    }

    return dedupeUrlEntries(entries);
  }
}
