import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { SitemapQueryService } from '../../services/sitemap-query.service';
import {
  absoluteSitemapUrl,
  buildCategoryLocPath,
} from '../../services/sitemap-url.builder';
import {
  sitemapCategoryHasIndexableProductSql,
  sitemapIndexableProductParams,
} from '../../utils/sitemap-indexable-product.util';
import {
  AuditFilters,
  AuditRecord,
  COMMON_AUDIT_COLUMNS,
  SitemapAuditProvider,
  UrlCheckResult,
} from '../sitemap-audit.types';
import { applyRecordFilters, formatIso } from './provider.utils';

@Injectable()
export class CategoryAuditProvider implements SitemapAuditProvider {
  readonly type = 'categories' as const;

  constructor(
    @InjectRepository(CategoryEntity)
    private readonly categoriesRepo: Repository<CategoryEntity>,
    private readonly queryService: SitemapQueryService,
    private readonly configService: ConfigService,
  ) {}

  columns() {
    return COMMON_AUDIT_COLUMNS;
  }

  private baseUrl(): string {
    return (this.configService.get<string>('sitemap.baseUrl') ?? '').replace(/\/+$/, '');
  }

  async fetchAll(filters: AuditFilters): Promise<AuditRecord[]> {
    const baseUrl = this.baseUrl();
    const nodes = await this.queryService.loadCategoryNodes();
    const indexableParams = sitemapIndexableProductParams();

    const [entities, eligibleRows] = await Promise.all([
      this.categoriesRepo
        .createQueryBuilder('category')
        .withDeleted()
        .select([
          'category.id',
          'category.refId',
          'category.name',
          'category.slug',
          'category.status',
          'category.deletedAt',
          'category.updatedAt',
        ])
        .orderBy('category.id', 'ASC')
        .getMany(),
      this.categoriesRepo
        .createQueryBuilder('category')
        .select('category.id', 'id')
        .where('category.status = :status', { status: MasterStatus.ACTIVE })
        .andWhere(sitemapCategoryHasIndexableProductSql('category'))
        .setParameters(indexableParams)
        .getRawMany<{ id: string }>(),
    ]);

    const eligibleIds = new Set(eligibleRows.map((row) => row.id));

    const records: AuditRecord[] = entities.map((entity) => {
      const deleted = Boolean(entity.deletedAt);
      const locPath = buildCategoryLocPath(this.queryService.categorySlugPath(nodes, entity.id));
      const eligible = !deleted && eligibleIds.has(entity.id) && Boolean(locPath);
      let exclusionReason: string | null = null;
      if (deleted) exclusionReason = 'Soft-deleted';
      else if (entity.status !== MasterStatus.ACTIVE) exclusionReason = `Status is ${entity.status}`;
      else if (!eligibleIds.has(entity.id)) exclusionReason = 'No indexable products';
      else if (!locPath) exclusionReason = 'Could not build category path';

      return {
        name: entity.name,
        refId: entity.refId,
        slug: entity.slug,
        locPath,
        url: locPath && baseUrl ? absoluteSitemapUrl(baseUrl, locPath) : null,
        status: entity.status,
        deletedAt: formatIso(entity.deletedAt),
        updatedAt: formatIso(entity.updatedAt),
        sitemapEligible: eligible,
        exclusionReason: eligible ? null : exclusionReason,
      };
    });

    return applyRecordFilters(records, filters);
  }

  async matchPath(pathname: string, baseUrl: string): Promise<UrlCheckResult | null> {
    if (!pathname.startsWith('/product-category')) return null;
    const records = await this.fetchAll({});
    const normalized = pathname.replace(/\/+$/, '') || '/';
    const match = records.find((row) => (String(row.locPath ?? '').replace(/\/+$/, '') || '/') === normalized);
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
