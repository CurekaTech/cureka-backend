import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SITEMAP_STATIC_URLS } from '../../config/static-urls';
import { absoluteSitemapUrl } from '../../services/sitemap-url.builder';
import {
  AuditColumn,
  AuditFilters,
  AuditRecord,
  SitemapAuditProvider,
  UrlCheckResult,
} from '../sitemap-audit.types';
import { applyRecordFilters } from './provider.utils';

@Injectable()
export class StaticAuditProvider implements SitemapAuditProvider {
  readonly type = 'static' as const;

  constructor(private readonly configService: ConfigService) {}

  columns(): AuditColumn[] {
    return [
      { key: 'name', header: 'Path' },
      { key: 'url', header: 'URL' },
      { key: 'status', header: 'Status' },
      { key: 'sitemapEligible', header: 'Sitemap Eligible' },
      { key: 'exclusionReason', header: 'Exclusion Reason' },
    ];
  }

  private baseUrl(): string {
    return (this.configService.get<string>('sitemap.baseUrl') ?? '').replace(/\/+$/, '');
  }

  async fetchAll(filters: AuditFilters): Promise<AuditRecord[]> {
    const baseUrl = this.baseUrl();
    const records: AuditRecord[] = SITEMAP_STATIC_URLS.map((item) => ({
      name: item.path,
      refId: null,
      slug: item.path,
      locPath: item.path,
      url: baseUrl ? absoluteSitemapUrl(baseUrl, item.path) : item.path,
      status: 'static',
      deletedAt: null,
      updatedAt: null,
      sitemapEligible: true,
      exclusionReason: null,
    }));
    return applyRecordFilters(records, filters);
  }

  async matchPath(pathname: string, baseUrl: string): Promise<UrlCheckResult | null> {
    const normalized = pathname === '' ? '/' : pathname.replace(/\/+$/, '') || '/';
    const match = SITEMAP_STATIC_URLS.find((item) => item.path === normalized);
    if (!match) return null;
    return {
      found: true,
      sitemapType: this.type,
      refId: null,
      name: match.path,
      slug: match.path,
      status: 'static',
      deletedAt: null,
      sitemapEligible: true,
      exclusionReason: null,
      url: absoluteSitemapUrl(baseUrl, match.path),
      locPath: match.path,
    };
  }
}
