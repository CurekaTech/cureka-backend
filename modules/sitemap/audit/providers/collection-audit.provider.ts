import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HomeSectionEntity } from '@modules/master/entities/home-section.entity';
import { HomeSectionType } from '@modules/master/enums/home-section-type.enum';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import {
  absoluteSitemapUrl,
  buildCollectionLocPath,
} from '../../services/sitemap-url.builder';
import {
  sitemapCollectionHasIndexableProductSql,
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
export class CollectionAuditProvider implements SitemapAuditProvider {
  readonly type = 'collections' as const;

  constructor(
    @InjectRepository(HomeSectionEntity)
    private readonly homeSectionsRepo: Repository<HomeSectionEntity>,
    private readonly configService: ConfigService,
  ) {}

  columns() {
    return [
      ...COMMON_AUDIT_COLUMNS.slice(0, 4),
      { key: 'type', header: 'Section Type' },
      ...COMMON_AUDIT_COLUMNS.slice(4),
    ];
  }

  private baseUrl(): string {
    return (this.configService.get<string>('sitemap.baseUrl') ?? '').replace(/\/+$/, '');
  }

  async fetchAll(filters: AuditFilters): Promise<AuditRecord[]> {
    const baseUrl = this.baseUrl();
    const indexableParams = sitemapIndexableProductParams();
    const [entities, eligibleRows] = await Promise.all([
      this.homeSectionsRepo
        .createQueryBuilder('section')
        .withDeleted()
        .select([
          'section.id',
          'section.refId',
          'section.title',
          'section.slug',
          'section.type',
          'section.status',
          'section.deletedAt',
          'section.updatedAt',
        ])
        .where('section.type = :type', { type: HomeSectionType.PRODUCT_SLIDER })
        .orderBy('section.id', 'ASC')
        .getMany(),
      this.homeSectionsRepo
        .createQueryBuilder('section')
        .select('section.id', 'id')
        .where('section.status = :status', { status: MasterStatus.ACTIVE })
        .andWhere('section.type = :type', { type: HomeSectionType.PRODUCT_SLIDER })
        .andWhere(sitemapCollectionHasIndexableProductSql('section'))
        .setParameters(indexableParams)
        .getRawMany<{ id: string }>(),
    ]);
    const eligibleIds = new Set(eligibleRows.map((row) => row.id));

    const records: AuditRecord[] = entities.map((entity) => {
      const deleted = Boolean(entity.deletedAt);
      const locPath = buildCollectionLocPath(entity.slug);
      const eligible = !deleted && eligibleIds.has(entity.id) && Boolean(locPath);
      let exclusionReason: string | null = null;
      if (deleted) exclusionReason = 'Soft-deleted';
      else if (entity.status !== MasterStatus.ACTIVE) exclusionReason = `Status is ${entity.status}`;
      else if (!eligibleIds.has(entity.id)) exclusionReason = 'No indexable products in product_ref_ids';
      else if (!locPath) exclusionReason = 'Missing slug';

      return {
        name: entity.title,
        refId: entity.refId,
        slug: entity.slug,
        type: entity.type,
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
    if (!pathname.startsWith('/collections/')) return null;
    const slug = pathname.slice('/collections/'.length).replace(/\/+$/, '');
    if (!slug || slug.includes('/')) return null;
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
