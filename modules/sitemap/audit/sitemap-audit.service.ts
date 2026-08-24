import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { SitemapGroup, sitemapGroupLivePath, sitemapGroupLivePrefix } from '../config/sitemap-groups';
import { SitemapQueryService } from '../services/sitemap-query.service';
import { SitemapStorageService } from '../services/sitemap-storage.service';
import { absoluteSitemapUrl } from '../services/sitemap-url.builder';
import {
  applyAuditFilters,
  buildSummaryStats,
  detectAuditIssues,
} from './sitemap-audit-issue.detector';
import { SitemapAuditRegistry } from './sitemap-audit.registry';
import {
  createAuditOutputDir,
  writeAllSummaryXlsx,
  writeAuditReports,
  writeCompareXlsx,
} from './sitemap-audit-report.writer';
import {
  AuditFilters,
  AuditOutputFormat,
  AuditReportPayload,
  AuditSummaryStats,
  CompareResult,
  SITEMAP_AUDIT_TYPES,
  SitemapAuditType,
  UrlCheckResult,
  isSitemapAuditType,
} from './sitemap-audit.types';
import {
  BlogAuditProvider,
  BrandAuditProvider,
  CategoryAuditProvider,
  CollectionAuditProvider,
  HealthConcernAuditProvider,
  ProductAuditProvider,
  StaticAuditProvider,
  WellnessGoalAuditProvider,
} from './providers';

@Injectable()
export class SitemapAuditService implements OnModuleInit {
  private readonly logger = new Logger(SitemapAuditService.name);

  constructor(
    private readonly registry: SitemapAuditRegistry,
    private readonly queryService: SitemapQueryService,
    private readonly storageService: SitemapStorageService,
    private readonly configService: ConfigService,
    private readonly categoryProvider: CategoryAuditProvider,
    private readonly brandProvider: BrandAuditProvider,
    private readonly healthConcernProvider: HealthConcernAuditProvider,
    private readonly wellnessGoalProvider: WellnessGoalAuditProvider,
    private readonly collectionProvider: CollectionAuditProvider,
    private readonly productProvider: ProductAuditProvider,
    private readonly blogProvider: BlogAuditProvider,
    private readonly staticProvider: StaticAuditProvider,
  ) {}

  onModuleInit(): void {
    for (const provider of [
      this.categoryProvider,
      this.brandProvider,
      this.healthConcernProvider,
      this.wellnessGoalProvider,
      this.collectionProvider,
      this.productProvider,
      this.blogProvider,
      this.staticProvider,
    ]) {
      this.registry.register(provider);
    }
  }

  private baseUrl(): string {
    const value = (this.configService.get<string>('sitemap.baseUrl') ?? '').replace(/\/+$/, '');
    if (!value) {
      throw new Error('SITEMAP_BASE_URL or STOREFRONT_URL must be set for sitemap audit');
    }
    return value;
  }

  async buildReport(
    type: SitemapAuditType,
    filters: AuditFilters = {},
  ): Promise<AuditReportPayload> {
    const provider = this.registry.get(type);
    const allRecords = await provider.fetchAll({});
    const filtered = applyAuditFilters(allRecords, filters);
    const requireSlug = type !== 'static';
    const requireRefId = type !== 'static';
    const issues = detectAuditIssues(filtered, { requireSlug, requireRefId });
    const summary = buildSummaryStats({
      type,
      records: filtered,
      issues,
      baseUrl: this.baseUrl(),
    });
    return {
      type,
      columns: provider.columns(),
      records: filtered,
      issues,
      summary,
    };
  }

  async exportType(options: {
    type: SitemapAuditType;
    format?: AuditOutputFormat;
    filters?: AuditFilters;
    outDir?: string;
  }): Promise<{ outDir: string; files: string[]; summary: AuditSummaryStats }> {
    const format = options.format ?? 'xlsx';
    const outDir = options.outDir ?? createAuditOutputDir();
    const payload = await this.buildReport(options.type, options.filters ?? {});
    const files = await writeAuditReports({ outDir, format, payload });
    this.logger.log(
      `Audit ${options.type}: records=${payload.summary.totalDbRecords} eligible=${payload.summary.eligibleRecords} issues=${payload.issues.length}`,
    );
    return { outDir, files, summary: payload.summary };
  }

  async exportAll(options: {
    format?: AuditOutputFormat;
    filters?: AuditFilters;
  }): Promise<{ outDir: string; files: string[]; summaries: AuditSummaryStats[] }> {
    const outDir = createAuditOutputDir();
    const files: string[] = [];
    const summaries: AuditSummaryStats[] = [];
    for (const type of SITEMAP_AUDIT_TYPES) {
      const result = await this.exportType({
        type,
        format: options.format ?? 'xlsx',
        filters: options.filters,
        outDir,
      });
      files.push(...result.files);
      summaries.push(result.summary);
    }
    const summaryFile = path.join(outDir, 'summary.xlsx');
    await writeAllSummaryXlsx(summaryFile, summaries);
    files.push(summaryFile);
    return { outDir, files, summaries };
  }

  async checkUrl(url: string): Promise<UrlCheckResult> {
    const baseUrl = this.baseUrl();
    let pathname: string;
    try {
      const parsed = new URL(url);
      pathname = parsed.pathname || '/';
    } catch {
      pathname = url.startsWith('/') ? url : `/${url}`;
    }
    pathname = pathname.replace(/\/+$/, '') || '/';

    for (const provider of this.registry.list()) {
      const result = await provider.matchPath(pathname, baseUrl);
      if (result) return result;
    }
    return { found: false, url: absoluteSitemapUrl(baseUrl, pathname), locPath: pathname };
  }

  async compareType(type: SitemapAuditType): Promise<CompareResult & { file?: string }> {
    const baseUrl = this.baseUrl();
    const eligiblePaths = await this.collectEligibleLocPaths(type);
    const eligibleUrls = eligiblePaths.map((locPath) => absoluteSitemapUrl(baseUrl, locPath));
    const liveUrls = await this.collectLiveLocs(type);

    const eligibleSet = new Set(eligibleUrls);
    const liveCounts = new Map<string, number>();
    for (const url of liveUrls) {
      liveCounts.set(url, (liveCounts.get(url) ?? 0) + 1);
    }
    const liveSet = new Set(liveUrls);

    const matching = [...eligibleSet].filter((url) => liveSet.has(url)).sort();
    const missingFromSitemap = [...eligibleSet].filter((url) => !liveSet.has(url)).sort();
    const extraInSitemap = [...liveSet].filter((url) => !eligibleSet.has(url)).sort();
    const duplicateInSitemap = [...liveCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([url]) => url)
      .sort();

    const result: CompareResult = {
      type,
      matching,
      missingFromSitemap,
      extraInSitemap,
      duplicateInSitemap,
      eligibleCount: eligibleSet.size,
      liveCount: liveUrls.length,
    };

    const outDir = createAuditOutputDir();
    const file = path.join(outDir, `compare-${type}.xlsx`);
    await writeCompareXlsx(file, result);
    return { ...result, file };
  }

  private async collectEligibleLocPaths(type: SitemapAuditType): Promise<string[]> {
    const batchSize = this.configService.get<number>('sitemap.batchSize') ?? 10_000;
    switch (type) {
      case 'static':
        return this.queryService.getStaticEntries().map((entry) => entry.locPath);
      case 'categories':
        return (await this.queryService.collectCategoryEntries(batchSize)).map((e) => e.locPath);
      case 'brands':
        return (await this.queryService.collectBrandEntries(batchSize)).map((e) => e.locPath);
      case 'health-concerns':
        return (await this.queryService.collectHealthConcernEntries(batchSize)).map((e) => e.locPath);
      case 'wellness-goals':
        return (await this.queryService.collectWellnessGoalEntries(batchSize)).map((e) => e.locPath);
      case 'collections':
        return (await this.queryService.collectCollectionEntries(batchSize)).map((e) => e.locPath);
      case 'blogs':
        return (await this.queryService.collectBlogEntries(batchSize)).map((e) => e.locPath);
      case 'products': {
        const paths: string[] = [];
        for await (const entry of this.queryService.iterateProductEntries(batchSize)) {
          paths.push(entry.locPath);
        }
        return paths;
      }
      default:
        return [];
    }
  }

  private async collectLiveLocs(type: SitemapAuditType): Promise<string[]> {
    const group = type as SitemapGroup;
    const relativePaths = new Set<string>();

    if (type === 'static') {
      relativePaths.add('static.xml');
    } else if (type === 'products') {
      for (const key of await this.storageService.listLive('products/')) {
        if (key.endsWith('.xml')) relativePaths.add(key);
      }
    } else {
      relativePaths.add(sitemapGroupLivePath(group));
      relativePaths.add(`${group}.xml`);
      for (const key of await this.storageService.listLive(sitemapGroupLivePrefix(group))) {
        if (key.endsWith('.xml')) relativePaths.add(key);
      }
      for (const key of await this.storageService.listLive(`${group}/`)) {
        if (key.endsWith('.xml')) relativePaths.add(key);
      }
    }

    const locs: string[] = [];
    for (const relative of relativePaths) {
      const exists = await this.storageService.existsLive(relative);
      if (!exists) continue;
      const stream = await this.storageService.createLiveReadStream(relative);
      const xml = await this.streamToString(stream);
      locs.push(...this.extractLocs(xml));
    }
    return locs;
  }

  private extractLocs(xml: string): string[] {
    const values: string[] = [];
    const pattern = /<loc>([\s\S]*?)<\/loc>/g;
    let match: RegExpExecArray | null = pattern.exec(xml);
    while (match) {
      values.push(
        match[1]
          .trim()
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'"),
      );
      match = pattern.exec(xml);
    }
    return values;
  }

  private async streamToString(stream: NodeJS.ReadableStream): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}

export const assertAuditType = (value: string): SitemapAuditType => {
  if (!isSitemapAuditType(value)) {
    throw new Error(
      `Unknown sitemap audit type "${value}". Supported: ${SITEMAP_AUDIT_TYPES.join(', ')}`,
    );
  }
  return value;
};
