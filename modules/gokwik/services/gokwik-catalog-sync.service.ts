import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { Brackets, DataSource, IsNull } from 'typeorm';
import { GokwikRepository } from '../repositories/gokwik.repository';
import { GokwikApiService } from './gokwik-api.service';
import { GokwikQueueService } from './gokwik-queue.service';

@Injectable()
export class GokwikCatalogSyncService {
  private readonly logger = new Logger(GokwikCatalogSyncService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly apiService: GokwikApiService,
    private readonly repository: GokwikRepository,
    private readonly queueService: GokwikQueueService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
  ) {}

  async syncProduct(productId: string): Promise<void> {
    this.assertConfiguredEnabled();
    await this.repository.markSyncState('product', productId, 'syncing');
    try {
      // withDeleted so soft-deleted products can be pushed as is_deleted=true
      const product = await this.dataSource.getRepository(ProductEntity).findOne({
        where: { id: productId },
        relations: { variants: true, media: true, tagMappings: { tag: true } },
        withDeleted: true,
      });
      if (!product) throw new NotFoundException('Product not found');

      const activeVariants = (product.variants ?? []).filter((variant) => !variant.deletedAt);
      const media = (product.media ?? []).filter((item) => !item.deletedAt);

      const images = (
        await Promise.all(
          media.map(async (item) => {
            const src = (await this.storageUrlEnricher.toReference(item.url))?.url ?? '';
            if (!src) return null;
            return {
              id: item.id,
              product_id: product.id,
              src,
              variant_ids: item.variantId ? [item.variantId] : [],
            };
          }),
        )
      ).filter((image): image is NonNullable<typeof image> => Boolean(image));

      const fallbackImageId = images[0]?.id ?? '';
      const isDeleted = Boolean(product.deletedAt) || product.status !== ProductStatus.PUBLISHED;
      // GoKwik Sync Product only documents status = "published"
      const status = 'published';
      const tags = (product.tagMappings ?? [])
        .map((mapping) => mapping.tag?.slug ?? mapping.tag?.name ?? '')
        .filter(Boolean)
        .join(',');

      const payload = {
        id: product.id,
        title: product.name,
        status,
        tags,
        updated_at: (product.updatedAt ?? new Date()).toISOString(),
        handle: product.slug,
        body_html: product.description ?? '',
        is_deleted: isDeleted,
        variants: activeVariants.map((variant) => {
          const variantImageId =
            media.find((item) => item.variantId === variant.id)?.id ?? fallbackImageId;
          return {
            id: variant.id,
            product_id: product.id,
            image_id: variantImageId || product.id,
            title: variant.displayName?.trim() || variant.slug || variant.sku,
            sku: variant.sku,
            price: Math.round(Number(variant.sellingPrice) || 0),
            compare_at_price: Math.round(Number(variant.mrp) || Number(variant.sellingPrice) || 0),
            inventory_quantity: Math.max(0, Number(variant.stock) || 0),
          };
        }),
        images,
      };

      this.logger.log(
        {
          productId: product.id,
          refId: product.refId,
          status: product.status,
          is_deleted: isDeleted,
          variantCount: payload.variants.length,
          imageCount: payload.images.length,
        },
        'Syncing product to GoKwik',
      );

      await this.apiService.syncProducts(payload);
      await this.repository.markSyncState('product', productId, 'synced', {
        remoteId: product.externalProductId ?? product.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown product sync error';
      this.logger.error({ productId, error: message }, 'GoKwik product sync failed');
      await this.repository.markSyncState('product', productId, 'failed', {
        lastError: message,
      });
      throw error;
    }
  }

  async syncCollection(categoryId: string): Promise<void> {
    this.assertConfiguredEnabled();
    await this.repository.markSyncState('collection', categoryId, 'syncing');
    try {
      const category = await this.dataSource.getRepository(CategoryEntity).findOne({
        where: { id: categoryId },
        withDeleted: true,
      });
      if (!category) throw new NotFoundException('Category not found');

      const products = await this.dataSource
        .getRepository(ProductEntity)
        .createQueryBuilder('product')
        .select('product.id', 'id')
        .where(
          new Brackets((query) => {
            query
              .where('product.categoryId = :categoryId', { categoryId })
              .orWhere('product.subCategoryId = :categoryId', { categoryId })
              .orWhere('product.subSubCategoryId = :categoryId', { categoryId })
              .orWhere('product.subSubSubCategoryId = :categoryId', { categoryId });
          }),
        )
        .andWhere('product.deletedAt IS NULL')
        .andWhere('product.status = :published', { published: ProductStatus.PUBLISHED })
        .getRawMany<{ id: string }>();

      const payload = {
        id: category.id,
        handle: category.slug,
        title: category.name,
        product_ids: products.map((product) => product.id),
        updated_at: (category.updatedAt ?? new Date()).toISOString(),
      };

      this.logger.log(
        {
          categoryId: category.id,
          refId: category.refId,
          productCount: payload.product_ids.length,
          deleted: Boolean(category.deletedAt),
        },
        'Syncing collection to GoKwik',
      );

      await this.apiService.syncCollections(payload);
      await this.repository.markSyncState('collection', categoryId, 'synced', {
        remoteId: category.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown collection sync error';
      this.logger.error({ categoryId, error: message }, 'GoKwik collection sync failed');
      await this.repository.markSyncState('collection', categoryId, 'failed', {
        lastError: message,
      });
      throw error;
    }
  }

  async enqueueBackfill(): Promise<{ products: number; collections: number }> {
    this.assertConfiguredEnabled();
    const [products, collections] = await Promise.all([
      this.dataSource.getRepository(ProductEntity).find({
        select: { id: true },
        where: { deletedAt: IsNull() },
      }),
      this.dataSource.getRepository(CategoryEntity).find({
        select: { id: true },
        where: { deletedAt: IsNull() },
      }),
    ]);
    await Promise.all(products.map((product) => this.queueService.enqueueProductSync(product.id)));
    await Promise.all(
      collections.map((collection) => this.queueService.enqueueCollectionSync(collection.id)),
    );
    this.logger.log(
      { products: products.length, collections: collections.length },
      'Enqueued GoKwik catalog backfill',
    );
    return { products: products.length, collections: collections.length };
  }

  private assertConfiguredEnabled(): void {
    if (!this.configService.get<boolean>('gokwik.catalogSyncEnabled')) {
      throw new ServiceUnavailableException(
        'GoKwik catalog sync is disabled. Set GOKWIK_CATALOG_SYNC_ENABLED=true',
      );
    }
    const baseUrl = this.configService.get<string>('gokwik.baseUrl');
    const appId = this.configService.get<string>('gokwik.appId');
    const appSecret = this.configService.get<string>('gokwik.appSecret');
    if (!baseUrl || !appId || !appSecret) {
      throw new ServiceUnavailableException(
        'GoKwik catalog sync is not configured (need GOKWIK_BASE_URL, GOKWIK_APP_ID, GOKWIK_APP_SECRET)',
      );
    }
  }
}
