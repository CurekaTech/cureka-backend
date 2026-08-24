import {
  applyAuditFilters,
  buildSummaryStats,
  detectAuditIssues,
} from './sitemap-audit-issue.detector';
import { AuditRecord } from './sitemap-audit.types';
import { SITEMAP_STATIC_URLS } from '../config/static-urls';
import { absoluteSitemapUrl, buildBrandLocPath } from '../services/sitemap-url.builder';
import { SitemapAuditRegistry } from './sitemap-audit.registry';

describe('sitemap audit issue detector', () => {
  const baseRecords: AuditRecord[] = [
    {
      name: 'Alpha',
      refId: 'BR001',
      slug: 'alpha',
      url: 'https://beta.cureka.com/product-brands/alpha',
      status: 'active',
      deletedAt: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
      sitemapEligible: true,
    },
    {
      name: 'Alpha Dup',
      refId: 'BR001',
      slug: 'alpha',
      url: 'https://beta.cureka.com/product-brands/alpha',
      status: 'active',
      deletedAt: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
      sitemapEligible: true,
    },
    {
      name: 'Missing',
      refId: null,
      slug: null,
      url: null,
      status: 'inactive',
      deletedAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      sitemapEligible: false,
      exclusionReason: 'Soft-deleted',
    },
  ];

  it('flags missing, duplicate, inactive, deleted, and not eligible issues', () => {
    const issues = detectAuditIssues(baseRecords);
    const types = new Set(issues.map((issue) => issue.issueType));
    expect(types.has('missing_ref_id')).toBe(true);
    expect(types.has('missing_slug')).toBe(true);
    expect(types.has('duplicate_ref_id')).toBe(true);
    expect(types.has('duplicate_slug')).toBe(true);
    expect(types.has('duplicate_url')).toBe(true);
    expect(types.has('soft_deleted')).toBe(true);
    expect(types.has('inactive')).toBe(true);
    expect(types.has('not_eligible')).toBe(true);
  });

  it('can skip duplicate_ref_id for multi-variant product audits', () => {
    const issues = detectAuditIssues(baseRecords, { skipDuplicateRefId: true });
    expect(issues.some((issue) => issue.issueType === 'duplicate_ref_id')).toBe(false);
    expect(issues.some((issue) => issue.issueType === 'duplicate_url')).toBe(true);
  });

  it('builds summary stats', () => {
    const issues = detectAuditIssues(baseRecords);
    const summary = buildSummaryStats({
      type: 'brands',
      records: baseRecords,
      issues,
      baseUrl: 'https://beta.cureka.com',
    });
    expect(summary.totalDbRecords).toBe(3);
    expect(summary.eligibleRecords).toBe(2);
    expect(summary.excludedRecords).toBe(1);
    expect(summary.duplicateRefId).toBeGreaterThan(0);
  });

  it('applies filters', () => {
    const eligible = applyAuditFilters(baseRecords, { eligibleOnly: true });
    expect(eligible).toHaveLength(2);
    const byRef = applyAuditFilters(baseRecords, { refId: 'BR001' });
    expect(byRef).toHaveLength(2);
    const search = applyAuditFilters(baseRecords, { search: 'missing' });
    expect(search).toHaveLength(1);
  });
});

describe('sitemap audit registry', () => {
  it('registers and resolves providers', () => {
    const registry = new SitemapAuditRegistry();
    registry.register({
      type: 'static',
      columns: () => [],
      fetchAll: async () => [],
      matchPath: async () => null,
    });
    expect(registry.get('static').type).toBe('static');
    expect(registry.types()).toEqual(['static']);
  });
});

describe('static + brand URL builders used by audit', () => {
  it('builds brand and static absolute URLs', () => {
    expect(buildBrandLocPath('himalaya')).toBe('/product-brands/himalaya');
    expect(absoluteSitemapUrl('https://beta.cureka.com', '/product-brands/himalaya')).toBe(
      'https://beta.cureka.com/product-brands/himalaya',
    );
    expect(SITEMAP_STATIC_URLS.some((item) => item.path === '/')).toBe(true);
    expect(SITEMAP_STATIC_URLS.some((item) => item.path === '/product-brands')).toBe(true);
  });
});
