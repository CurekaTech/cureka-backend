import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { ImageAssetEntity } from '../entities/image-asset.entity';
import { ImageAssetStatus } from '../enums/image-asset-status.enum';
import { IImageSourceIdentity, IImageVariantRecord } from '../interfaces/image-pipeline.interface';

@Injectable()
export class ImageAssetRepository {
  constructor(
    @InjectRepository(ImageAssetEntity)
    private readonly repo: Repository<ImageAssetEntity>,
  ) {}

  async findBySource(
    bucket: string,
    key: string,
  ): Promise<ImageAssetEntity | null> {
    return this.repo.findOne({ where: { sourceBucket: bucket, sourceKey: key } });
  }

  async findBySources(sources: IImageSourceIdentity[]): Promise<ImageAssetEntity[]> {
    if (sources.length === 0) return [];

    const keys = [...new Set(sources.map((item) => item.key))];
    const buckets = [...new Set(sources.map((item) => item.bucket))];

    const rows = await this.repo.find({
      where: {
        sourceKey: In(keys),
        sourceBucket: In(buckets),
      },
    });

    const wanted = new Set(sources.map((item) => `${item.bucket}\0${item.key}`));
    return rows.filter((row) => wanted.has(`${row.sourceBucket}\0${row.sourceKey}`));
  }

  async upsertPending(input: {
    sourceBucket: string;
    sourceKey: string;
    pipelineVersion: string;
    processToken: string;
    sourceMime?: string | null;
    sourceBytes?: number | null;
  }): Promise<ImageAssetEntity> {
    const existing = await this.findBySource(input.sourceBucket, input.sourceKey);
    if (existing) {
      existing.pipelineVersion = input.pipelineVersion;
      existing.processToken = input.processToken;
      existing.status = ImageAssetStatus.PENDING;
      existing.variants = [];
      existing.errorCode = null;
      existing.errorMessage = null;
      existing.sourceHash = null;
      existing.processedAt = null;
      if (input.sourceMime) existing.sourceMime = input.sourceMime;
      if (typeof input.sourceBytes === 'number') existing.sourceBytes = input.sourceBytes;
      return this.repo.save(existing);
    }

    const created = this.repo.create({
      sourceBucket: input.sourceBucket,
      sourceKey: input.sourceKey,
      pipelineVersion: input.pipelineVersion,
      processToken: input.processToken,
      status: ImageAssetStatus.PENDING,
      variants: [],
      sourceMime: input.sourceMime ?? null,
      sourceBytes: input.sourceBytes ?? null,
      attemptCount: 0,
    });
    return this.repo.save(created);
  }

  async markProcessing(id: string, processToken: string): Promise<ImageAssetEntity | null> {
    await this.repo
      .createQueryBuilder()
      .update(ImageAssetEntity)
      .set({
        status: ImageAssetStatus.PROCESSING,
        attemptCount: () => '"attempt_count" + 1',
      })
      .where('id = :id AND process_token = :processToken', { id, processToken })
      .execute();

    return this.repo.findOne({ where: { id, processToken } });
  }

  async publishIfTokenMatches(input: {
    id: string;
    processToken: string;
    sourceHash: string;
    sourceWidth: number;
    sourceHeight: number;
    sourceMime: string;
    sourceBytes: number;
    pipelineVersion: string;
    status: ImageAssetStatus;
    variants: IImageVariantRecord[];
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<boolean> {
    const result = await this.repo
      .createQueryBuilder()
      .update(ImageAssetEntity)
      .set({
        sourceHash: input.sourceHash,
        sourceWidth: input.sourceWidth,
        sourceHeight: input.sourceHeight,
        sourceMime: input.sourceMime,
        sourceBytes: input.sourceBytes,
        pipelineVersion: input.pipelineVersion,
        status: input.status,
        variants: input.variants,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        processedAt: () => 'NOW()',
      })
      .where('id = :id AND process_token = :processToken', {
        id: input.id,
        processToken: input.processToken,
      })
      .execute();

    return (result.affected ?? 0) > 0;
  }

  async findStale(input: {
    statuses: ImageAssetStatus[];
    olderThan: Date;
    limit: number;
  }): Promise<ImageAssetEntity[]> {
    return this.repo.find({
      where: {
        status: In(input.statuses),
        updatedAt: LessThan(input.olderThan),
      },
      order: { updatedAt: 'ASC' },
      take: input.limit,
    });
  }

  async isCurrent(input: {
    bucket: string;
    key: string;
    pipelineVersion: string;
    requiredWidths: number[];
  }): Promise<boolean> {
    const row = await this.findBySource(input.bucket, input.key);
    if (!row) return false;
    if (row.pipelineVersion !== input.pipelineVersion) return false;
    if (row.status !== ImageAssetStatus.READY && row.status !== ImageAssetStatus.PARTIAL) {
      return false;
    }
    const readyWidths = new Set(row.variants.map((variant) => variant.width));
    return input.requiredWidths.every(
      (width) => readyWidths.has(width) || (row.sourceWidth !== null && width > row.sourceWidth),
    );
  }
}
