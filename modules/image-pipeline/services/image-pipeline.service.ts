import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { QUEUE_NAMES } from '@packages/queue';
import {
  IStorageUploadHook,
  StorageService,
} from '@packages/storage';
import { ImageAssetRepository } from '../repositories/image-asset.repository';
import { ImageProcessorService, ImageProcessingError } from './image-processor.service';
import { IMAGE_PIPELINE_JOB_NAMES, DERIVATIVE_CACHE_CONTROL } from '../constants/image-pipeline.constants';
import { ImageAssetStatus } from '../enums/image-asset-status.enum';
import { IImageProcessJobData, IImageVariantRecord } from '../interfaces/image-pipeline.interface';
import { sha256Hex } from '../utils/image-bytes.util';
import { buildDerivativeObjectKey, requiredWidthsForSource } from '../utils/derivative-key.util';
import {
  assertSafeJobPayload,
  isProcessableImageMime,
  isSafeObjectKey,
  shouldSkipSourceKey,
} from '../utils/source-key.util';
import { sanitizeErrorMessage } from '../utils/redact-storage-url.util';

@Injectable()
export class ImagePipelineService implements IStorageUploadHook {
  private readonly logger = new Logger(ImagePipelineService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    private readonly assets: ImageAssetRepository,
    private readonly processor: ImageProcessorService,
    @InjectQueue(QUEUE_NAMES.IMAGE_PIPELINE) private readonly queue: Queue,
  ) {}

  async onStoredObject(input: { key: string; mimetype: string; size: number }): Promise<void> {
    if (!this.isProcessingEnabled()) return;
    if (!isProcessableImageMime(input.mimetype)) return;
    await this.scheduleSource({
      key: input.key,
      mime: input.mimetype,
      bytes: input.size,
    });
  }

  async scheduleSource(input: {
    key: string;
    bucket?: string;
    mime?: string | null;
    bytes?: number | null;
  }): Promise<'queued' | 'skipped'> {
    if (!this.isProcessingEnabled()) return 'skipped';

    const key = input.key;
    const prefix = this.derivativePrefix();
    if (!isSafeObjectKey(key) || shouldSkipSourceKey(key, prefix)) {
      return 'skipped';
    }

    const bucket = input.bucket ?? this.storageService.getBucketName();
    const pipelineVersion = this.pipelineVersion();
    const processToken = randomUUID();

    await this.assets.upsertPending({
      sourceBucket: bucket,
      sourceKey: key,
      pipelineVersion,
      processToken,
      sourceMime: input.mime,
      sourceBytes: input.bytes,
    });

    const enqueued = await this.enqueueProcessJob({
      sourceBucket: bucket,
      sourceKey: key,
      processToken,
      pipelineVersion,
    });

    if (!enqueued) {
      this.logger.warn(
        `Image process job enqueue failed; pending row retained for reconcile (${key})`,
      );
    }

    return 'queued';
  }

  async enqueueProcessJob(data: IImageProcessJobData): Promise<boolean> {
    try {
      assertSafeJobPayload(data);
      await this.queue.add(IMAGE_PIPELINE_JOB_NAMES.PROCESS_SOURCE, data, {
        jobId: this.jobId(data),
        attempts: this.configService.get<number>('imagePipeline.retryAttempts') ?? 5,
        backoff: {
          type: 'exponential',
          delay: this.configService.get<number>('imagePipeline.retryBackoffMs') ?? 5000,
        },
        removeOnComplete: this.configService.get<number>('imagePipeline.jobRetentionComplete') ?? 100,
        removeOnFail: this.configService.get<number>('imagePipeline.jobRetentionFailed') ?? 200,
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to enqueue image process job (${data.sourceKey}): ${sanitizeErrorMessage(error)}`,
      );
      return false;
    }
  }

  async processJob(data: IImageProcessJobData): Promise<void> {
    assertSafeJobPayload(data);
    const prefix = this.derivativePrefix();
    if (shouldSkipSourceKey(data.sourceKey, prefix)) {
      return;
    }

    const asset = await this.assets.findBySource(data.sourceBucket, data.sourceKey);
    if (!asset || asset.processToken !== data.processToken) {
      this.logger.warn(
        `Skipping image job; source was replaced or pending row missing (${data.sourceKey})`,
      );
      return;
    }

    const claimed = await this.assets.markProcessing(asset.id, data.processToken);
    if (!claimed) {
      return;
    }

    const maxBytes = this.configService.get<number>('imagePipeline.maxInputBytes') ?? 15 * 1024 * 1024;
    const maxPixels = this.configService.get<number>('imagePipeline.maxDecodedPixels') ?? 40_000_000;
    const timeoutMs = this.configService.get<number>('imagePipeline.processTimeoutMs') ?? 30_000;
    const quality = this.configService.get<number>('imagePipeline.webpQuality') ?? 80;
    const allowedWidths = this.configService.get<number[]>('imagePipeline.allowedWidths') ?? [];
    const startedAt = Date.now();

    try {
      const exists = await this.storageService.exists(data.sourceKey);
      if (!exists) {
        await this.publishTerminal(claimed.id, data.processToken, {
          status: ImageAssetStatus.FAILED,
          sourceHash: claimed.sourceHash ?? 'missing',
          sourceWidth: 0,
          sourceHeight: 0,
          sourceMime: claimed.sourceMime ?? 'application/octet-stream',
          sourceBytes: 0,
          variants: [],
          errorCode: 'missing_source',
          errorMessage: 'Source object was not found',
        });
        return;
      }

      const buffer = await this.storageService.readObjectBuffer(data.sourceKey, maxBytes);
      const sourceHash = sha256Hex(buffer);
      const inspected = await this.processor.inspect(buffer, maxPixels);

      if (inspected.unsupportedReason) {
        await this.publishTerminal(claimed.id, data.processToken, {
          status: ImageAssetStatus.UNSUPPORTED,
          sourceHash,
          sourceWidth: inspected.width,
          sourceHeight: inspected.height,
          sourceMime: inspected.mime,
          sourceBytes: buffer.length,
          variants: [],
          errorCode: inspected.unsupportedReason,
          errorMessage: `Source is ${inspected.unsupportedReason}; original remains the fallback`,
        });
        this.logger.log(
          `Image source marked unsupported (${data.sourceKey}) reason=${inspected.unsupportedReason} sourceBytes=${buffer.length} durationMs=${Date.now() - startedAt}`,
        );
        return;
      }

      const targetWidths = requiredWidthsForSource(inspected.width, allowedWidths);
      const variants: IImageVariantRecord[] = [];

      for (const width of targetWidths) {
        const encoded = await this.processor.encodeWebp({
          buffer,
          requestedWidth: width,
          quality,
          timeoutMs,
          maxDecodedPixels: maxPixels,
        });
        const objectKey = buildDerivativeObjectKey({
          prefix,
          pipelineVersion: data.pipelineVersion,
          sourceHash,
          width: encoded.width,
          format: 'webp',
        });

        await this.storageService.uploadAtPath({
          relativePath: objectKey,
          stream: Readable.from(encoded.buffer),
          mimetype: 'image/webp',
          cacheControl: DERIVATIVE_CACHE_CONTROL,
        });

        variants.push({
          width: encoded.width,
          height: encoded.height,
          format: 'webp',
          bytes: encoded.bytes,
          key: objectKey,
        });
      }

      const uniqueVariants = this.dedupeByWidth(variants);
      const status =
        uniqueVariants.length === 0
          ? ImageAssetStatus.FAILED
          : uniqueVariants.length < targetWidths.length
            ? ImageAssetStatus.PARTIAL
            : ImageAssetStatus.READY;

      const published = await this.publishTerminal(claimed.id, data.processToken, {
        status,
        sourceHash,
        sourceWidth: inspected.width,
        sourceHeight: inspected.height,
        sourceMime: inspected.mime,
        sourceBytes: buffer.length,
        variants: uniqueVariants,
        errorCode: status === ImageAssetStatus.FAILED ? 'no_variants' : null,
        errorMessage: null,
      });

      if (!published) {
        this.logger.warn(
          `Discarded image variants because the source was replaced during processing (${data.sourceKey})`,
        );
        return;
      }

      this.logger.log(
        `Image derivatives published (${data.sourceKey}) sourceBytes=${buffer.length} ${inspected.width}x${inspected.height} variantCount=${uniqueVariants.length} variantBytes=${uniqueVariants.reduce((sum, item) => sum + item.bytes, 0)} durationMs=${Date.now() - startedAt} status=${status}`,
      );
    } catch (error) {
      if (error instanceof ImageProcessingError && error.permanent) {
        await this.publishTerminal(claimed.id, data.processToken, {
          status:
            error.code === 'unsupported' || error.code === 'svg' || error.code === 'animated'
              ? ImageAssetStatus.UNSUPPORTED
              : ImageAssetStatus.FAILED,
          sourceHash: claimed.sourceHash ?? 'unknown',
          sourceWidth: claimed.sourceWidth ?? 0,
          sourceHeight: claimed.sourceHeight ?? 0,
          sourceMime: claimed.sourceMime ?? 'application/octet-stream',
          sourceBytes: claimed.sourceBytes ?? 0,
          variants: [],
          errorCode: error.code,
          errorMessage: sanitizeErrorMessage(error),
        });
        return;
      }
      throw error;
    }
  }

  async reconcilePending(limit?: number): Promise<number> {
    const batchSize =
      limit ?? this.configService.get<number>('imagePipeline.reconcileBatchSize') ?? 50;
    const stale = await this.assets.findStale({
      statuses: [ImageAssetStatus.PENDING, ImageAssetStatus.PROCESSING],
      olderThan: new Date(Date.now() - 10 * 60 * 1000),
      limit: batchSize,
    });

    let queued = 0;
    for (const row of stale) {
      const ok = await this.enqueueProcessJob({
        sourceBucket: row.sourceBucket,
        sourceKey: row.sourceKey,
        processToken: row.processToken,
        pipelineVersion: row.pipelineVersion,
      });
      if (ok) queued += 1;
    }
    return queued;
  }

  async retryFailed(limit = 50): Promise<number> {
    const stale = await this.assets.findStale({
      statuses: [ImageAssetStatus.FAILED],
      olderThan: new Date(0),
      limit,
    });
    let queued = 0;
    for (const row of stale) {
      const result = await this.scheduleSource({
        key: row.sourceKey,
        bucket: row.sourceBucket,
        mime: row.sourceMime,
        bytes: row.sourceBytes,
      });
      if (result === 'queued') queued += 1;
    }
    return queued;
  }

  isDeliveryEnabled(): boolean {
    return this.configService.get<boolean>('imagePipeline.deliveryEnabled') === true;
  }

  isProcessingEnabled(): boolean {
    return this.configService.get<boolean>('imagePipeline.processingEnabled') === true;
  }

  isWorkerEnabled(): boolean {
    return this.configService.get<boolean>('imagePipeline.workerEnabled') === true;
  }

  pipelineVersion(): string {
    return this.configService.get<string>('imagePipeline.pipelineVersion') ?? 'v1';
  }

  allowedWidths(): number[] {
    return this.configService.get<number[]>('imagePipeline.allowedWidths') ?? [];
  }

  private derivativePrefix(): string {
    return this.configService.get<string>('imagePipeline.derivativePrefix') ?? 'derivatives';
  }

  private jobId(data: IImageProcessJobData): string {
    return `img:${data.pipelineVersion}:${data.processToken}`;
  }

  private dedupeByWidth(variants: IImageVariantRecord[]): IImageVariantRecord[] {
    const byWidth = new Map<number, IImageVariantRecord>();
    for (const variant of variants) {
      if (!byWidth.has(variant.width)) {
        byWidth.set(variant.width, variant);
      }
    }
    return [...byWidth.values()].sort((a, b) => a.width - b.width);
  }

  private async publishTerminal(
    id: string,
    processToken: string,
    input: {
      status: ImageAssetStatus;
      sourceHash: string;
      sourceWidth: number;
      sourceHeight: number;
      sourceMime: string;
      sourceBytes: number;
      variants: IImageVariantRecord[];
      errorCode?: string | null;
      errorMessage?: string | null;
    },
  ): Promise<boolean> {
    return this.assets.publishIfTokenMatches({
      id,
      processToken,
      pipelineVersion: this.pipelineVersion(),
      ...input,
    });
  }
}
