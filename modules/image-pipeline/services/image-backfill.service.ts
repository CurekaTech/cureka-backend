import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { StorageService, parseStorageFileReference } from '@packages/storage';
import { ImagePipelineService } from './image-pipeline.service';
import { ImageAssetRepository } from '../repositories/image-asset.repository';
import { ImagePipelineCheckpointRepository } from '../repositories/image-pipeline-checkpoint.repository';
import {
  ALL_IMAGE_BACKFILL_ENTITY_TYPES,
  HOMEPAGE_PRIORITY_ENTITY_TYPES,
  ImageBackfillEntityType,
} from '../enums/image-backfill-entity.enum';
import { IImageBackfillCounts, IImageSourceIdentity } from '../interfaces/image-pipeline.interface';
import { isSafeObjectKey, shouldSkipSourceKey } from '../utils/source-key.util';
import { ImageAssetStatus } from '../enums/image-asset-status.enum';

export type ImageBackfillOptions = {
  apply: boolean;
  resume: boolean;
  retryFailed: boolean;
  entityTypes: ImageBackfillEntityType[];
  sampleLimit?: number;
  batchSize: number;
  rateLimitMs: number;
  checkpointId: string;
};

type CollectedSource = IImageSourceIdentity & { cursorId: string };

@Injectable()
export class ImageBackfillService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    private readonly pipeline: ImagePipelineService,
    private readonly assets: ImageAssetRepository,
    private readonly checkpoints: ImagePipelineCheckpointRepository,
  ) {}

  async run(options: ImageBackfillOptions): Promise<IImageBackfillCounts> {
    const stats = this.checkpoints.emptyStats();
    const seen = new Set<string>();
    let remaining = options.sampleLimit;
    const fallbackBucket = this.storageService.getBucketName();
    const prefix = this.configService.get<string>('imagePipeline.derivativePrefix') ?? 'derivatives';
    const pipelineVersion = this.pipeline.pipelineVersion();

    let startEntityIndex = 0;
    let cursorId: string | null = null;
    if (options.resume) {
      const checkpoint = await this.checkpoints.get(options.checkpointId);
      if (checkpoint?.entityType) {
        const index = options.entityTypes.indexOf(checkpoint.entityType as ImageBackfillEntityType);
        if (index >= 0) startEntityIndex = index;
        cursorId = checkpoint.cursorId;
        Object.assign(stats, checkpoint.stats);
      }
    }

    for (let typeIndex = startEntityIndex; typeIndex < options.entityTypes.length; typeIndex += 1) {
      const entityType = options.entityTypes[typeIndex];
      let localCursor = typeIndex === startEntityIndex ? cursorId : null;

      while (remaining === undefined || remaining > 0) {
        const batch = await this.loadBatch(entityType, localCursor, options.batchSize);
        if (batch.length === 0) break;

        for (const source of batch) {
          stats.scanned += 1;
          localCursor = source.cursorId;
          if (remaining !== undefined) remaining -= 1;

          const dedupeKey = `${source.bucket}\0${source.key}`;
          if (seen.has(dedupeKey)) {
            stats.skippedDuplicate += 1;
            continue;
          }
          seen.add(dedupeKey);

          if (!isSafeObjectKey(source.key) || shouldSkipSourceKey(source.key, prefix)) {
            stats.unsupported += 1;
            continue;
          }

          const exists = await this.storageService.exists(source.key);
          if (!exists) {
            stats.missingSource += 1;
            continue;
          }

          const current = await this.assets.findBySource(source.bucket, source.key);
          if (
            current &&
            current.pipelineVersion === pipelineVersion &&
            (current.status === ImageAssetStatus.READY ||
              current.status === ImageAssetStatus.PARTIAL ||
              current.status === ImageAssetStatus.UNSUPPORTED) &&
            !options.retryFailed
          ) {
            stats.alreadyComplete += 1;
            continue;
          }

          if (
            options.retryFailed &&
            current &&
            current.status !== ImageAssetStatus.FAILED &&
            current.status !== ImageAssetStatus.PENDING &&
            current.status !== ImageAssetStatus.PROCESSING
          ) {
            stats.alreadyComplete += 1;
            continue;
          }

          stats.eligible += 1;
          if (!options.apply) continue;

          try {
            const result = await this.pipeline.scheduleSource({
              key: source.key,
              bucket: source.bucket || fallbackBucket,
            });
            if (result === 'queued') stats.queued += 1;
            else stats.unsupported += 1;
          } catch {
            stats.failed += 1;
          }

          if (options.rateLimitMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, options.rateLimitMs));
          }
        }

        await this.checkpoints.saveProgress({
          id: options.checkpointId,
          cursorId: localCursor,
          entityType,
          stats,
        });

        if (batch.length < options.batchSize) break;
        if (remaining !== undefined && remaining <= 0) break;
      }
    }

    return stats;
  }

  defaultEntityTypes(priorityHomepage: boolean): ImageBackfillEntityType[] {
    if (priorityHomepage) {
      return [
        ...HOMEPAGE_PRIORITY_ENTITY_TYPES,
        ...ALL_IMAGE_BACKFILL_ENTITY_TYPES.filter(
          (type) => !HOMEPAGE_PRIORITY_ENTITY_TYPES.includes(type),
        ),
      ];
    }
    return [...ALL_IMAGE_BACKFILL_ENTITY_TYPES];
  }

  private async loadBatch(
    entityType: ImageBackfillEntityType,
    cursorId: string | null,
    limit: number,
  ): Promise<CollectedSource[]> {
    const fallbackBucket = this.storageService.getBucketName();
    switch (entityType) {
      case ImageBackfillEntityType.BANNERS:
        return this.queryJsonColumn('banners', 'id', 'image_url', cursorId, limit, fallbackBucket);
      case ImageBackfillEntityType.HOME_SECTIONS:
        return this.queryHomeSectionBanners(cursorId, limit, fallbackBucket);
      case ImageBackfillEntityType.PRODUCTS:
        return this.queryJsonColumn('product_media', 'id', 'url', cursorId, limit, fallbackBucket);
      case ImageBackfillEntityType.BRANDS:
        return this.queryJsonColumns(
          'brands',
          'id',
          ['logo', 'banner', 'featured_banner', 'promotional_banner', 'secondary_banner', 'offer_banner', 'faq_banner'],
          cursorId,
          limit,
          fallbackBucket,
        );
      case ImageBackfillEntityType.CATEGORIES:
        return this.queryJsonColumns(
          'categories',
          'id',
          ['image', 'banner', 'faq_banner'],
          cursorId,
          limit,
          fallbackBucket,
        );
      case ImageBackfillEntityType.HEALTH_CONCERNS:
        return this.queryJsonColumns(
          'health_concerns',
          'id',
          ['icon', 'banner', 'faq_banner'],
          cursorId,
          limit,
          fallbackBucket,
        );
      case ImageBackfillEntityType.WELLNESS_GOALS:
        return this.queryJsonColumns(
          'wellness_goals',
          'id',
          ['image', 'faq_banner'],
          cursorId,
          limit,
          fallbackBucket,
        );
      case ImageBackfillEntityType.BLOG:
        return this.queryJsonColumn('blog_posts', 'id', 'featured_image', cursorId, limit, fallbackBucket);
      case ImageBackfillEntityType.WATCH_AND_SHOP:
        return this.queryJsonColumn(
          'watch_and_shop_items',
          'id',
          'media_url',
          cursorId,
          limit,
          fallbackBucket,
        );
      case ImageBackfillEntityType.EXPERT_TALK:
        return this.queryJsonColumn(
          'expert_talk_items',
          'id',
          'thumbnail',
          cursorId,
          limit,
          fallbackBucket,
        );
      case ImageBackfillEntityType.TESTIMONIALS:
        return this.queryJsonColumn('testimonials', 'id', 'image', cursorId, limit, fallbackBucket);
      case ImageBackfillEntityType.GALLERY:
        return this.queryVarcharColumn('gallery', 'id', 'url', cursorId, limit, fallbackBucket);
      case ImageBackfillEntityType.MANUFACTURERS:
        return this.queryJsonColumn('manufacturers', 'id', 'logo', cursorId, limit, fallbackBucket);
      case ImageBackfillEntityType.PACKERS:
        return this.queryJsonColumn('packers', 'id', 'logo', cursorId, limit, fallbackBucket);
      case ImageBackfillEntityType.IMPORTERS:
        return this.queryJsonColumn('importers', 'id', 'logo', cursorId, limit, fallbackBucket);
      default:
        return [];
    }
  }

  private async queryJsonColumn(
    table: string,
    idColumn: string,
    jsonColumn: string,
    cursorId: string | null,
    limit: number,
    fallbackBucket: string,
  ): Promise<CollectedSource[]> {
    const cursorSql = cursorId ? `AND ${idColumn} > $1` : '';
    const params: Array<string | number> = cursorId ? [cursorId, limit] : [limit];
    const limitParam = cursorId ? '$2' : '$1';
    const sql = `
      SELECT ${idColumn}::text AS cursor_id, ${jsonColumn} AS ref
      FROM ${table}
      WHERE ${jsonColumn} IS NOT NULL
      ${cursorSql}
      ORDER BY ${idColumn}
      LIMIT ${limitParam}
    `;
    const rows = (await this.dataSource.query(sql, params)) as Array<{
      cursor_id: string;
      ref: unknown;
    }>;
    return this.extractRefs(rows, fallbackBucket);
  }

  private async queryJsonColumns(
    table: string,
    idColumn: string,
    jsonColumns: string[],
    cursorId: string | null,
    limit: number,
    fallbackBucket: string,
  ): Promise<CollectedSource[]> {
    const cursorSql = cursorId ? `AND ${idColumn} > $1` : '';
    const params: Array<string | number> = cursorId ? [cursorId, limit] : [limit];
    const limitParam = cursorId ? '$2' : '$1';
    const selects = jsonColumns.map((column) => `${column} AS ${column}`).join(', ');
    const sql = `
      SELECT ${idColumn}::text AS cursor_id, ${selects}
      FROM ${table}
      WHERE ${idColumn} IS NOT NULL
      ${cursorSql}
      ORDER BY ${idColumn}
      LIMIT ${limitParam}
    `;
    const rows = (await this.dataSource.query(sql, params)) as Array<Record<string, unknown>>;
    const collected: CollectedSource[] = [];
    for (const row of rows) {
      const cursor = String(row['cursor_id'] ?? '');
      for (const column of jsonColumns) {
        const parsed = parseStorageFileReference(row[column]);
        if (!parsed) continue;
        collected.push({ bucket: parsed.name, key: parsed.key, cursorId: cursor });
      }
    }
    return collected;
  }

  private async queryVarcharColumn(
    table: string,
    idColumn: string,
    column: string,
    cursorId: string | null,
    limit: number,
    fallbackBucket: string,
  ): Promise<CollectedSource[]> {
    const cursorSql = cursorId ? `AND ${idColumn} > $1` : '';
    const params: Array<string | number> = cursorId ? [cursorId, limit] : [limit];
    const limitParam = cursorId ? '$2' : '$1';
    const sql = `
      SELECT ${idColumn}::text AS cursor_id, ${column} AS ref
      FROM ${table}
      WHERE ${column} IS NOT NULL
      ${cursorSql}
      ORDER BY ${idColumn}
      LIMIT ${limitParam}
    `;
    const rows = (await this.dataSource.query(sql, params)) as Array<{
      cursor_id: string;
      ref: unknown;
    }>;
    return this.extractRefs(rows, fallbackBucket);
  }

  private async queryHomeSectionBanners(
    cursorId: string | null,
    limit: number,
    fallbackBucket: string,
  ): Promise<CollectedSource[]> {
    const cursorSql = cursorId ? `AND id > $1` : '';
    const params: Array<string | number> = cursorId ? [cursorId, limit] : [limit];
    const limitParam = cursorId ? '$2' : '$1';
    const sql = `
      SELECT id::text AS cursor_id, banners AS ref
      FROM home_sections
      WHERE banners IS NOT NULL
      ${cursorSql}
      ORDER BY id
      LIMIT ${limitParam}
    `;
    const rows = (await this.dataSource.query(sql, params)) as Array<{
      cursor_id: string;
      ref: unknown;
    }>;
    const collected: CollectedSource[] = [];
    for (const row of rows) {
      if (!Array.isArray(row.ref)) continue;
      for (const slide of row.ref) {
        if (!slide || typeof slide !== 'object') continue;
        const record = slide as { imageUrl?: unknown; mobileImageUrl?: unknown };
        for (const value of [record.imageUrl, record.mobileImageUrl]) {
          const parsed = parseStorageFileReference(value);
          if (parsed) {
            collected.push({
              bucket: parsed.name || fallbackBucket,
              key: parsed.key,
              cursorId: row.cursor_id,
            });
          }
        }
      }
    }
    return collected;
  }

  private extractRefs(
    rows: Array<{ cursor_id: string; ref: unknown }>,
    fallbackBucket: string,
  ): CollectedSource[] {
    const collected: CollectedSource[] = [];
    for (const row of rows) {
      const parsed = parseStorageFileReference(row.ref);
      if (!parsed) continue;
      collected.push({
        bucket: parsed.name || fallbackBucket,
        key: parsed.key,
        cursorId: row.cursor_id,
      });
    }
    return collected;
  }
}
