import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlogPostEntity } from '@modules/master/entities/blog-post.entity';
import { BlogPostStatus } from '@modules/master/enums/blog-post-status.enum';
import { BlogPostVisibility } from '@modules/master/enums/blog-post-visibility.enum';
import { absoluteSitemapUrl, buildBlogLocPath } from '../../services/sitemap-url.builder';
import {
  AuditColumn,
  AuditFilters,
  AuditRecord,
  SitemapAuditProvider,
  UrlCheckResult,
} from '../sitemap-audit.types';
import { applyRecordFilters, formatIso } from './provider.utils';

@Injectable()
export class BlogAuditProvider implements SitemapAuditProvider {
  readonly type = 'blogs' as const;

  constructor(
    @InjectRepository(BlogPostEntity)
    private readonly blogPostsRepo: Repository<BlogPostEntity>,
    private readonly configService: ConfigService,
  ) {}

  columns(): AuditColumn[] {
    return [
      { key: 'name', header: 'Title' },
      { key: 'refId', header: 'Ref ID' },
      { key: 'slug', header: 'Slug' },
      { key: 'url', header: 'URL' },
      { key: 'status', header: 'Status' },
      { key: 'visibility', header: 'Visibility' },
      { key: 'deletedAt', header: 'Deleted At' },
      { key: 'updatedAt', header: 'Updated At' },
      { key: 'sitemapEligible', header: 'Sitemap Eligible' },
      { key: 'exclusionReason', header: 'Exclusion Reason' },
    ];
  }

  private baseUrl(): string {
    return (this.configService.get<string>('sitemap.baseUrl') ?? '').replace(/\/+$/, '');
  }

  async fetchAll(filters: AuditFilters): Promise<AuditRecord[]> {
    const baseUrl = this.baseUrl();
    const entities = await this.blogPostsRepo
      .createQueryBuilder('post')
      .withDeleted()
      .select([
        'post.id',
        'post.refId',
        'post.title',
        'post.slug',
        'post.status',
        'post.visibility',
        'post.deletedAt',
        'post.updatedAt',
      ])
      .orderBy('post.id', 'ASC')
      .getMany();

    const records: AuditRecord[] = entities.map((entity) => {
      const deleted = Boolean(entity.deletedAt);
      const locPath = buildBlogLocPath(entity.slug);
      const eligible =
        !deleted &&
        entity.status === BlogPostStatus.PUBLISHED &&
        entity.visibility === BlogPostVisibility.PUBLIC &&
        Boolean(locPath);
      let exclusionReason: string | null = null;
      if (deleted) exclusionReason = 'Soft-deleted';
      else if (entity.status !== BlogPostStatus.PUBLISHED) exclusionReason = `Status is ${entity.status}`;
      else if (entity.visibility !== BlogPostVisibility.PUBLIC) {
        exclusionReason = `Visibility is ${entity.visibility}`;
      } else if (!locPath) exclusionReason = 'Missing slug';

      return {
        name: entity.title,
        refId: entity.refId,
        slug: entity.slug,
        locPath,
        url: locPath && baseUrl ? absoluteSitemapUrl(baseUrl, locPath) : null,
        status: entity.status,
        visibility: entity.visibility,
        deletedAt: formatIso(entity.deletedAt),
        updatedAt: formatIso(entity.updatedAt),
        sitemapEligible: eligible,
        exclusionReason: eligible ? null : exclusionReason,
      };
    });

    return applyRecordFilters(records, filters);
  }

  async matchPath(pathname: string, baseUrl: string): Promise<UrlCheckResult | null> {
    if (!pathname.startsWith('/') || pathname === '/') return null;
    const reserved = [
      '/product-category',
      '/product-brands',
      '/health-concerns',
      '/wellness-goals',
      '/collections',
      '/shop',
      '/sitemaps',
      '/blog',
      '/support',
      '/policies',
      '/categories',
      '/about',
      '/bundles',
      '/experts',
      '/expert-talks',
      '/watch-and-shop',
      '/become-seller',
      '/account',
      '/cart',
      '/checkout',
      '/order',
    ];
    if (reserved.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return null;
    }
    if (pathname.slice(1).includes('/')) return null;

    const slug = pathname.slice(1);
    const records = await this.fetchAll({});
    const match = records.find((row) => String(row.slug ?? '') === slug);
    if (!match) {
      return { found: false, sitemapType: this.type, url: absoluteSitemapUrl(baseUrl, pathname), locPath: pathname };
    }
    return {
      found: true,
      sitemapType: this.type,
      refId: match.refId,
      name: match.name,
      slug: match.slug,
      status: match.status,
      deletedAt: match.deletedAt,
      sitemapEligible: match.sitemapEligible,
      exclusionReason: match.exclusionReason,
      url: match.url ?? absoluteSitemapUrl(baseUrl, pathname),
      locPath: match.locPath,
    };
  }
}
