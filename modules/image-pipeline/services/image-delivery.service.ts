import { Injectable } from '@nestjs/common';
import {
  IImageDeliveryPayload,
  IStorageFileReference,
  IStorageFileReferenceResponse,
  StorageService,
} from '@packages/storage';
import { ImageAssetRepository } from '../repositories/image-asset.repository';
import { ImagePipelineService } from './image-pipeline.service';
import { mapAssetToDelivery } from '../mappers/image-delivery.mapper';
import { IMAGE_ASSET_CACHE_TTL_MS } from '../constants/image-pipeline.constants';
import { IImageAssetView, IImageSourceIdentity } from '../interfaces/image-pipeline.interface';
import { sourceCacheKey } from '../utils/source-key.util';
import { ImageAssetEntity } from '../entities/image-asset.entity';

@Injectable()
export class ImageDeliveryService {
  private readonly cache = new Map<string, { expiresAt: number; view: IImageAssetView | null }>();

  constructor(
    private readonly pipeline: ImagePipelineService,
    private readonly assets: ImageAssetRepository,
    private readonly storageService: StorageService,
  ) {}

  async attachToResponse(
    reference: IStorageFileReference,
    signed: IStorageFileReferenceResponse | null,
  ): Promise<IStorageFileReferenceResponse | null> {
    if (!signed) return null;
    if (!this.pipeline.isDeliveryEnabled()) return signed;

    const deliveries = await this.buildDeliveries([reference], new Map([[reference.key, signed.url]]));
    const delivery = deliveries.get(sourceCacheKey(reference.name, reference.key));
    if (!delivery) return signed;
    return { ...signed, imageDelivery: delivery };
  }

  async attachToMany(
    references: Array<IStorageFileReference | null>,
    signed: Array<IStorageFileReferenceResponse | null>,
  ): Promise<Array<IStorageFileReferenceResponse | null>> {
    if (!this.pipeline.isDeliveryEnabled()) return signed;

    const sources = references.filter((item): item is IStorageFileReference => Boolean(item));
    const originalUrls = new Map<string, string>();
    for (let index = 0; index < references.length; index += 1) {
      const ref = references[index];
      const url = signed[index]?.url;
      if (ref && url) originalUrls.set(ref.key, url);
    }

    const deliveries = await this.buildDeliveries(sources, originalUrls);

    return signed.map((item, index) => {
      const ref = references[index];
      if (!item || !ref) return item;
      const delivery = deliveries.get(sourceCacheKey(ref.name, ref.key));
      return delivery ? { ...item, imageDelivery: delivery } : item;
    });
  }

  private async buildDeliveries(
    sources: IStorageFileReference[],
    originalUrls: Map<string, string>,
  ): Promise<Map<string, IImageDeliveryPayload>> {
    const identities: IImageSourceIdentity[] = sources.map((item) => ({
      bucket: item.name,
      key: item.key,
    }));
    const views = await this.loadViews(identities);

    const variantKeys: string[] = [];
    for (const view of views.values()) {
      if (!view) continue;
      for (const variant of view.variants) {
        variantKeys.push(variant.key);
      }
    }

    const uniqueVariantKeys = [...new Set(variantKeys)];
    const variantResponses = uniqueVariantKeys.length
      ? await this.storageService.toFileReferenceResponses(
          uniqueVariantKeys.map((key) => ({ key, name: this.storageService.getBucketName() })),
        )
      : [];

    const variantUrls = new Map<string, string>();
    uniqueVariantKeys.forEach((key, index) => {
      const url = variantResponses[index]?.url;
      if (url) variantUrls.set(key, url);
    });

    const result = new Map<string, IImageDeliveryPayload>();
    for (const source of sources) {
      const cacheKey = sourceCacheKey(source.name, source.key);
      const originalUrl = originalUrls.get(source.key);
      if (!originalUrl) continue;
      result.set(
        cacheKey,
        mapAssetToDelivery({
          asset: views.get(cacheKey) ?? null,
          originalUrl,
          variantUrls,
        }),
      );
    }
    return result;
  }

  private async loadViews(
    sources: IImageSourceIdentity[],
  ): Promise<Map<string, IImageAssetView | null>> {
    const now = Date.now();
    const missing: IImageSourceIdentity[] = [];
    const views = new Map<string, IImageAssetView | null>();

    for (const source of sources) {
      const cacheKey = sourceCacheKey(source.bucket, source.key);
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        views.set(cacheKey, cached.view);
      } else {
        missing.push(source);
      }
    }

    if (missing.length > 0) {
      const rows = await this.assets.findBySources(missing);
      const found = new Map(rows.map((row) => [sourceCacheKey(row.sourceBucket, row.sourceKey), row]));
      for (const source of missing) {
        const cacheKey = sourceCacheKey(source.bucket, source.key);
        const view = this.toView(found.get(cacheKey) ?? null);
        views.set(cacheKey, view);
        this.cache.set(cacheKey, { view, expiresAt: now + IMAGE_ASSET_CACHE_TTL_MS });
      }
    }

    return views;
  }

  private toView(entity: ImageAssetEntity | null): IImageAssetView | null {
    if (!entity) return null;
    return {
      status: entity.status,
      sourceBucket: entity.sourceBucket,
      sourceKey: entity.sourceKey,
      sourceWidth: entity.sourceWidth,
      sourceHeight: entity.sourceHeight,
      sourceMime: entity.sourceMime,
      sourceBytes: entity.sourceBytes,
      pipelineVersion: entity.pipelineVersion,
      variants: entity.variants ?? [],
      errorCode: null,
    };
  }
}
