import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HealthConcernEntity } from '@modules/master/entities/health-concern.entity';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import {
  absoluteSitemapUrl,
  buildHealthConcernLocPath,
  slugifyForUrl,
} from '../../services/sitemap-url.builder';
import {
  sitemapHealthConcernHasIndexableProductSql,
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
export class HealthConcernAuditProvider implements SitemapAuditProvider {
  readonly type = 'health-concerns' as const;

  constructor(
    @InjectRepository(HealthConcernEntity)
    private readonly healthConcernsRepo: Repository<HealthConcernEntity>,
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
    const indexableParams = sitemapIndexableProductParams();
    const [entities, eligibleRows] = await Promise.all([
      this.healthConcernsRepo
        .createQueryBuilder('healthConcern')
        .withDeleted()
        .select([
          'healthConcern.id',
          'healthConcern.refId',
          'healthConcern.name',
          'healthConcern.slug',
          'healthConcern.status',
          'healthConcern.deletedAt',
          'healthConcern.updatedAt',
        ])
        .orderBy('healthConcern.id', 'ASC')
        .getMany(),
      this.healthConcernsRepo
        .createQueryBuilder('healthConcern')
        .select('healthConcern.id', 'id')
        .where('healthConcern.status = :status', { status: MasterStatus.ACTIVE })
        .andWhere(sitemapHealthConcernHasIndexableProductSql('healthConcern'))
        .setParameters(indexableParams)
        .getRawMany<{ id: string }>(),
    ]);
    const eligibleIds = new Set(eligibleRows.map((row) => row.id));

    const records: AuditRecord[] = entities.map((entity) => {
      const deleted = Boolean(entity.deletedAt);
      const locPath = buildHealthConcernLocPath(entity.slug);
      const eligible = !deleted && eligibleIds.has(entity.id) && Boolean(locPath);
      let exclusionReason: string | null = null;
      if (deleted) exclusionReason = 'Soft-deleted';
      else if (entity.status !== MasterStatus.ACTIVE) exclusionReason = `Status is ${entity.status}`;
      else if (!eligibleIds.has(entity.id)) exclusionReason = 'No indexable products';
      else if (!locPath) exclusionReason = 'Missing or invalid slug';

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
    if (!pathname.startsWith('/health-concerns/')) return null;
    const slugPart = pathname.slice('/health-concerns/'.length).replace(/\/+$/, '');
    if (!slugPart || slugPart.includes('/')) return null;
    const records = await this.fetchAll({});
    const match = records.find((row) => {
      const locSlug = slugifyForUrl(String(row.slug ?? ''));
      return locSlug === slugPart || String(row.locPath ?? '') === `/health-concerns/${slugPart}`;
    });
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
