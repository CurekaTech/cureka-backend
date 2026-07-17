import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { Brackets, DataSource, IsNull } from 'typeorm';
import { GokwikRepository } from '../repositories/gokwik.repository';
import { GokwikApiService } from './gokwik-api.service';
import { GokwikQueueService } from './gokwik-queue.service';

@Injectable()
export class GokwikCatalogSyncService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly apiService: GokwikApiService,
    private readonly repository: GokwikRepository,
    private readonly queueService: GokwikQueueService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
  ) {}

  async syncProduct(productId: string): Promise<void> {
    await this.assertEnabled();
    await this.repository.markSyncState('product', productId, 'syncing');
    try {
      const product = await this.dataSource.getRepository(ProductEntity).findOne({
        where: { id: productId },
        relations: { variants: true, media: true },
      });
      if (!product) throw new NotFoundException('Product not found');
      const images = await Promise.all(
        product.media.map(async (media) => ({
          id: media.id,
          product_id: product.id,
          src: (await this.storageUrlEnricher.toReference(media.url))?.url ?? '',
          variant_ids: media.variantId ? [media.variantId] : [],
        })),
      );
      await this.apiService.syncProducts({
        id: product.id,
        title: product.name,
        status: product.status,
        tags: '',
        updated_at: product.updatedAt.toISOString(),
        handle: product.slug,
        body_html: product.description ?? '',
        is_deleted: Boolean(product.deletedAt),
        variants: product.variants.map((variant) => ({
          id: variant.id,
          product_id: product.id,
          image_id:
            product.media.find((media) => media.variantId === variant.id)?.id ??
            product.media[0]?.id ??
            '',
          title: variant.slug,
          sku: variant.sku,
          price: Math.round(Number(variant.sellingPrice)),
          compare_at_price: Math.round(Number(variant.mrp)),
          inventory_quantity: variant.stock,
        })),
        images,
      });
      await this.repository.markSyncState('product', productId, 'synced', {
        remoteId: product.externalProductId ?? product.id,
      });
    } catch (error) {
      await this.repository.markSyncState('product', productId, 'failed', {
        lastError: error instanceof Error ? error.message : 'Unknown product sync error',
      });
      throw error;
    }
  }

  async syncCollection(categoryId: string): Promise<void> {
    await this.assertEnabled();
    await this.repository.markSyncState('collection', categoryId, 'syncing');
    try {
      const category = await this.dataSource
        .getRepository(CategoryEntity)
        .findOne({ where: { id: categoryId } });
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
        .getRawMany<{ id: string }>();
      await this.apiService.syncCollections({
        id: category.id,
        handle: category.slug,
        title: category.name,
        product_ids: products.map((product) => product.id),
        updated_at: category.updatedAt.toISOString(),
      });
      await this.repository.markSyncState('collection', categoryId, 'synced', {
        remoteId: category.id,
      });
    } catch (error) {
      await this.repository.markSyncState('collection', categoryId, 'failed', {
        lastError: error instanceof Error ? error.message : 'Unknown collection sync error',
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
    return { products: products.length, collections: collections.length };
  }

  private async assertEnabled(): Promise<void> {
    this.assertConfiguredEnabled();
  }

  private assertConfiguredEnabled(): void {
    if (!this.configService.get<boolean>('gokwik.catalogSyncEnabled')) {
      throw new NotFoundException('GoKwik catalog sync is disabled');
    }
  }
}
