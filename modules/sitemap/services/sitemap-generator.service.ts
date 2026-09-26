import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  SITEMAP_GROUPS,
  SitemapGroup,
  isSitemapGroup,
  liveKeyToGroup,
  liveKeyToPublicPath,
  sitemapGroupLegacyLivePath,
  sitemapGroupLivePath,
  sitemapGroupPublicPath,
} from '../config/sitemap-groups';
import { SitemapDirtyService } from './sitemap-dirty.service';
import { SitemapQueryService } from './sitemap-query.service';
import { SitemapStorageService } from './sitemap-storage.service';
import {
  SitemapUrlEntry,
  absoluteSitemapUrl,
  splitUrlEntries,
} from './sitemap-url.builder';
import {
  SitemapIndexEntry,
  buildSitemapIndexXml,
  buildUrlsetXml,
  validateSitemapIndexXml,
  validateUrlsetXml,
} from './sitemap-xml.builder';

export interface SitemapGenerationResult {
  groups: SitemapGroup[];
  urlCount: number;
  fileCount: number;
  durationMs: number;
}

@Injectable()
export class SitemapGeneratorService {
  private readonly logger = new Logger(SitemapGeneratorService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly queryService: SitemapQueryService,
    private readonly storageService: SitemapStorageService,
    private readonly dirtyService: SitemapDirtyService,
  ) {}

  async generateAll(): Promise<SitemapGenerationResult> {
    return this.generateGroups([...SITEMAP_GROUPS]);
  }

  async generateGroup(group: SitemapGroup): Promise<SitemapGenerationResult> {
    return this.generateGroups([group]);
  }

  async generateDirtyOrForced(): Promise<SitemapGenerationResult | null> {
    const force = this.configService.get<boolean>('sitemap.forceFullRebuild') ?? false;
    const dirty = force ? [...SITEMAP_GROUPS] : await this.dirtyService.listDirty();
    if (!dirty.length) {
      this.logger.log('Sitemap safety rebuild skipped — no dirty groups');
      return null;
    }
    return this.generateGroups(dirty);
  }

  private async generateGroups(groups: SitemapGroup[]): Promise<SitemapGenerationResult> {
    const startedAt = Date.now();
    const generationId = randomUUID();
    const baseUrl = this.requireBaseUrl();
    const batchSize = this.configService.get<number>('sitemap.batchSize') ?? 10_000;
    const maxUrlsPerFile = this.configService.get<number>('sitemap.maxUrlsPerFile') ?? 50_000;

    let targetGroups = [...groups];
    if (targetGroups.length < SITEMAP_GROUPS.length) {
      const liveOrigin = await this.readLiveSitemapOrigin();
      if (liveOrigin && liveOrigin !== baseUrl) {
        this.logger.warn(
          {
            configuredBaseUrl: baseUrl,
            liveSitemapOrigin: liveOrigin,
            requestedGroups: groups,
          },
          'Sitemap base URL changed since last publish — forcing full regenerate so index and child files stay consistent',
        );
        targetGroups = [...SITEMAP_GROUPS];
      }
    }

    this.logger.log(
      { generationId, groups: targetGroups, baseUrl, batchSize, maxUrlsPerFile },
      'Sitemap generation started',
    );

    await this.storageService.cleanupStaleStaging();

    for (const group of targetGroups) {
      await this.dirtyService.consumeDirty(group);
    }

    let urlCount = 0;
    let fileCount = 0;
    const stagedChildren: string[] = [];
    const publicChildPaths: string[] = [];
    const indexLastmod = new Date();
    const newLiveByGroup = new Map<SitemapGroup, string[]>();

    try {
      for (const group of targetGroups) {
        const entries = await this.collectGroupEntries(group, batchSize);
        urlCount += entries.length;
        const shards = this.shardEntries(group, entries, maxUrlsPerFile);
        const livePaths: string[] = [];

        for (const shard of shards) {
          const xml = buildUrlsetXml(baseUrl, shard.entries);
          const expectedLocs = shard.entries.map((entry) =>
            absoluteSitemapUrl(baseUrl, entry.locPath),
          );
          validateUrlsetXml(xml, expectedLocs);
          await this.storageService.writeStagingXml(generationId, shard.livePath, xml);
          stagedChildren.push(shard.livePath);
          publicChildPaths.push(shard.publicPath);
          livePaths.push(shard.livePath);
          fileCount += 1;
        }

        newLiveByGroup.set(group, livePaths);
        this.logger.log(
          { group, urls: entries.length, files: livePaths.length },
          'Sitemap group staged',
        );
      }

      const indexEntries = await this.buildIndexEntries(
        targetGroups,
        publicChildPaths,
        indexLastmod,
      );
      const indexXml = buildSitemapIndexXml(baseUrl, indexEntries);
      validateSitemapIndexXml(
        indexXml,
        indexEntries.map((entry) => absoluteSitemapUrl(baseUrl, entry.locPath)),
      );
      await this.storageService.writeStagingXml(generationId, 'sitemap.xml', indexXml);
      fileCount += 1;

      const obsoleteLivePaths = await this.collectObsoleteLivePaths(newLiveByGroup);
      await this.storageService.publishLive({
        generationId,
        childRelativePaths: stagedChildren,
        indexRelativePath: 'sitemap.xml',
        obsoleteLivePaths,
      });

      const durationMs = Date.now() - startedAt;
      this.logger.log(
        {
          generationId,
          groups: targetGroups,
          baseUrl,
          urlCount,
          fileCount,
          durationMs,
          obsoleteRemoved: obsoleteLivePaths.length,
        },
        'Sitemap generation succeeded',
      );
      return { groups: targetGroups, urlCount, fileCount, durationMs };
    } catch (error) {
      this.logger.error(
        {
          generationId,
          groups: targetGroups,
          baseUrl,
          error: error instanceof Error ? error.message : String(error),
        },
        'Sitemap generation failed — live files unchanged',
      );
      throw error;
    } finally {
      await this.storageService.deleteStaging(generationId).catch((error: unknown) => {
        this.logger.warn(
          {
            generationId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to delete sitemap staging prefix',
        );
      });
    }
  }

  private shardEntries(
    group: SitemapGroup,
    entries: SitemapUrlEntry[],
    maxUrlsPerFile: number,
  ): Array<{ livePath: string; publicPath: string; entries: SitemapUrlEntry[] }> {
    if (!entries.length) return [];
    const chunks = splitUrlEntries(entries, group === 'products' ? maxUrlsPerFile : entries.length);
    return chunks.map((chunk, index) => ({
      livePath: sitemapGroupLivePath(group, index + 1),
      publicPath: sitemapGroupPublicPath(group, index + 1),
      entries: chunk,
    }));
  }

  private async collectGroupEntries(
    group: SitemapGroup,
    batchSize: number,
  ): Promise<SitemapUrlEntry[]> {
    switch (group) {
      case 'static':
        return this.queryService.getStaticEntries();
      case 'products': {
        const entries: SitemapUrlEntry[] = [];
        for await (const entry of this.queryService.iterateProductEntries(batchSize)) {
          entries.push(entry);
        }
        return entries;
      }
      case 'categories':
        return this.queryService.collectCategoryEntries(batchSize);
      case 'brands':
        return this.queryService.collectBrandEntries(batchSize);
      case 'health-concerns':
        return this.queryService.collectHealthConcernEntries(batchSize);
      case 'wellness-goals':
        return this.queryService.collectWellnessGoalEntries(batchSize);
      case 'collections':
        return this.queryService.collectCollectionEntries(batchSize);
      case 'blogs':
        return this.queryService.collectBlogEntries(batchSize);
      case 'support':
        return this.queryService.collectSupportEntries(batchSize);
      case 'cms':
        return this.queryService.collectCmsEntries(batchSize);
      default:
        return [];
    }
  }

  private async buildIndexEntries(
    regeneratedGroups: SitemapGroup[],
    stagedPublicPaths: string[],
    lastmod: Date,
  ): Promise<SitemapIndexEntry[]> {
    const entries: SitemapIndexEntry[] = stagedPublicPaths.map((locPath) => ({ locPath, lastmod }));

    // Groups regenerated in this run are listed only from their fresh shards:
    // their old live files are pruned after publish, so listing them here would
    // point the index at files that no longer exist (e.g. an emptied group).
    const regenerated = new Set<SitemapGroup>(regeneratedGroups);
    const live = await this.storageService.listLive('');
    for (const path of live) {
      const group = liveKeyToGroup(path);
      if (group && regenerated.has(group)) continue;
      const locPath = liveKeyToPublicPath(path);
      if (!locPath) continue;
      entries.push({ locPath, lastmod });
    }

    const unique = new Map<string, SitemapIndexEntry>();
    for (const entry of entries) unique.set(entry.locPath, entry);

    const groupRank = (locPath: string): number => {
      if (locPath.includes('/sitemaps/products/')) return SITEMAP_GROUPS.indexOf('products');
      const file = locPath.match(/^\/sitemaps\/([^/]+)\.xml$/);
      const group = file?.[1];
      if (group && isSitemapGroup(group)) return SITEMAP_GROUPS.indexOf(group);
      return 999;
    };

    return [...unique.values()].sort((left, right) => {
      const rank = groupRank(left.locPath) - groupRank(right.locPath);
      if (rank !== 0) return rank;
      return left.locPath.localeCompare(right.locPath, undefined, { numeric: true });
    });
  }

  private async collectObsoleteLivePaths(
    newLiveByGroup: Map<SitemapGroup, string[]>,
  ): Promise<string[]> {
    const obsolete: string[] = [];
    for (const [group, livePaths] of newLiveByGroup.entries()) {
      const keep = new Set(livePaths);
      if (group === 'products') {
        const existing = await this.storageService.listLive('products/');
        for (const path of existing) {
          if (!keep.has(path)) obsolete.push(path);
        }
        continue;
      }
      const livePath = sitemapGroupLivePath(group);
      if (!keep.has(livePath) && (await this.storageService.existsLive(livePath))) {
        obsolete.push(livePath);
      }
      const legacyPath = sitemapGroupLegacyLivePath(group);
      if (legacyPath && !keep.has(legacyPath) && (await this.storageService.existsLive(legacyPath))) {
        obsolete.push(legacyPath);
      }
    }
    return obsolete;
  }

  private requireBaseUrl(): string {
    const baseUrl = this.configService.get<string>('sitemap.baseUrl')?.trim();
    if (!baseUrl) {
      throw new Error('SITEMAP_BASE_URL or STOREFRONT_URL must be set to generate sitemap loc URLs');
    }
    return baseUrl.replace(/\/+$/, '');
  }

  /**
   * Origin baked into the live index (or static urlset). Used to detect
   * STOREFRONT_URL / SITEMAP_BASE_URL drift after deploy so a partial group
   * job cannot rewrite sitemap.xml with a new host while leaving old children.
   */
  private async readLiveSitemapOrigin(): Promise<string | null> {
    for (const relativePath of ['sitemap.xml', 'static.xml'] as const) {
      try {
        const xml = await this.storageService.readLiveText(relativePath);
        if (!xml) continue;
        const match = xml.match(/<loc>\s*(https?:\/\/[^/\s<]+)/i);
        if (match?.[1]) {
          return match[1].replace(/\/+$/, '');
        }
      } catch (error) {
        this.logger.warn(
          {
            relativePath,
            error: error instanceof Error ? error.message : String(error),
          },
          'Could not read live sitemap origin for base-URL drift check',
        );
      }
    }
    return null;
  }
}
