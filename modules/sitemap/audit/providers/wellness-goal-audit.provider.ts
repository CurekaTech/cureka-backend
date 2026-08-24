import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WellnessGoalEntity } from '@modules/master/entities/wellness-goal.entity';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import {
  absoluteSitemapUrl,
  buildWellnessGoalLocPath,
  slugifyForUrl,
} from '../../services/sitemap-url.builder';
import {
  sitemapIndexableProductParams,
  sitemapWellnessGoalHasIndexableProductSql,
} from '../../utils/sitemap-indexable-product.util';
import {
  AuditColumn,
  AuditFilters,
  AuditRecord,
  SitemapAuditProvider,
  UrlCheckResult,
} from '../sitemap-audit.types';
import { applyRecordFilters, formatIso } from './provider.utils';

@Injectable()
export class WellnessGoalAuditProvider implements SitemapAuditProvider {
  readonly type = 'wellness-goals' as const;

  constructor(
    @InjectRepository(WellnessGoalEntity)
    private readonly wellnessGoalsRepo: Repository<WellnessGoalEntity>,
    private readonly configService: ConfigService,
  ) {}

  columns(): AuditColumn[] {
    return [
      { key: 'name', header: 'Name' },
      { key: 'refId', header: 'Ref ID' },
      { key: 'slug', header: 'Slug (from name)' },
      { key: 'url', header: 'URL' },
      { key: 'status', header: 'Status' },
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
    const indexableParams = sitemapIndexableProductParams();
    const [entities, eligibleRows] = await Promise.all([
      this.wellnessGoalsRepo
        .createQueryBuilder('wellnessGoal')
        .withDeleted()
        .select([
          'wellnessGoal.id',
          'wellnessGoal.refId',
          'wellnessGoal.name',
          'wellnessGoal.status',
          'wellnessGoal.deletedAt',
          'wellnessGoal.updatedAt',
        ])
        .orderBy('wellnessGoal.id', 'ASC')
        .getMany(),
      this.wellnessGoalsRepo
        .createQueryBuilder('wellnessGoal')
        .select('wellnessGoal.id', 'id')
        .where('wellnessGoal.status = :status', { status: MasterStatus.ACTIVE })
        .andWhere(sitemapWellnessGoalHasIndexableProductSql('wellnessGoal'))
        .setParameters(indexableParams)
        .getRawMany<{ id: string }>(),
    ]);
    const eligibleIds = new Set(eligibleRows.map((row) => row.id));

    const records: AuditRecord[] = entities.map((entity) => {
      const deleted = Boolean(entity.deletedAt);
      const locPath = buildWellnessGoalLocPath(entity.name);
      const derivedSlug = slugifyForUrl(entity.name ?? '');
      const eligible = !deleted && eligibleIds.has(entity.id) && Boolean(locPath);
      let exclusionReason: string | null = null;
      if (deleted) exclusionReason = 'Soft-deleted';
      else if (entity.status !== MasterStatus.ACTIVE) exclusionReason = `Status is ${entity.status}`;
      else if (!eligibleIds.has(entity.id)) exclusionReason = 'No indexable products';
      else if (!locPath) exclusionReason = 'Could not slugify name';

      return {
        name: entity.name,
        refId: entity.refId,
        slug: derivedSlug || null,
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
    if (!pathname.startsWith('/wellness-goals/')) return null;
    const slugPart = pathname.slice('/wellness-goals/'.length).replace(/\/+$/, '');
    if (!slugPart || slugPart.includes('/')) return null;
    const records = await this.fetchAll({});
    const match = records.find((row) => String(row.slug ?? '') === slugPart);
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
