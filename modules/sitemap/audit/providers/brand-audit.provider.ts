import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrandEntity } from '@modules/master/entities/brand.entity';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { absoluteSitemapUrl, buildBrandLocPath } from '../../services/sitemap-url.builder';
import {
  sitemapBrandHasIndexableProductSql,
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
export class BrandAuditProvider implements SitemapAuditProvider {
  readonly type = 'brands' as const;

  constructor(
    @InjectRepository(BrandEntity)
    private readonly brandsRepo: Repository<BrandEntity>,
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
      this.brandsRepo
        .createQueryBuilder('brand')
        .withDeleted()
        .select([
          'brand.id',
          'brand.refId',
          'brand.name',
          'brand.slug',
          'brand.status',
          'brand.deletedAt',
          'brand.updatedAt',
        ])
        .orderBy('brand.id', 'ASC')
        .getMany(),
      this.brandsRepo
        .createQueryBuilder('brand')
        .select('brand.id', 'id')
        .where('brand.status = :status', { status: MasterStatus.ACTIVE })
        .andWhere(sitemapBrandHasIndexableProductSql('brand'))
        .setParameters(indexableParams)
        .getRawMany<{ id: string }>(),
    ]);
    const eligibleIds = new Set(eligibleRows.map((row) => row.id));

    const records: AuditRecord[] = entities.map((entity) => {
      const deleted = Boolean(entity.deletedAt);
      const locPath = buildBrandLocPath(entity.slug);
      const eligible = !deleted && eligibleIds.has(entity.id) && Boolean(locPath);
      let exclusionReason: string | null = null;
      if (deleted) exclusionReason = 'Soft-deleted';
      else if (entity.status !== MasterStatus.ACTIVE) exclusionReason = `Status is ${entity.status}`;
      else if (!eligibleIds.has(entity.id)) exclusionReason = 'No indexable products';
      else if (!locPath) exclusionReason = 'Missing slug';

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
    if (!pathname.startsWith('/product-brands/')) return null;
    const slug = pathname.slice('/product-brands/'.length).replace(/\/+$/, '');
    if (!slug || slug.includes('/')) return null;
    const records = await this.fetchAll({ search: undefined });
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
