import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { ProductType } from '@modules/product/enums/product-type.enum';
import { PromotionalPageType } from '@modules/promotional-pages/enums/promotional-page-type.enum';
import { PromotionalTargetType } from '@modules/promotional-pages/enums/promotional-target-type.enum';
import { PromotionalPageEntity } from '@modules/promotional-pages/entities/promotional-page.entity';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { PRODUCT_MATCHES_CATEGORY_ENTITY_SQL } from '@modules/product/utils/product-category-hierarchies.util';
import { Brackets, DataSource, IsNull } from 'typeorm';
import { GokwikRepository } from '../repositories/gokwik.repository';
import {
  GokwikCollectionLockBusyError,
  GokwikCollectionLockService,
} from './gokwik-collection-lock.service';
import {
  GOKWIK_PRODUCT_PROMOTION_TYPE_FIELD,
  resolveGokwikPromotionType,
} from '../utils/gokwik-promotion-type.util';
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
    private readonly collectionLock: GokwikCollectionLockService,
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
      const media = product.media ?? [];

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

      const promotionTypes = product.refId
        ? await this.findNonDefaultPromotionTypes(product.refId)
        : [];
      const resolvedPromotion = resolveGokwikPromotionType(promotionTypes);
      if (resolvedPromotion.conflict.length > 0) {
        this.logger.warn(
          {
            productId: product.id,
            refId: product.refId,
            promotionTypes: resolvedPromotion.conflict,
          },
          'GoKwik product sync omitted promotionType because the product is on promotions with different non-default types',
        );
      }

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
        ...(resolvedPromotion.promotionType
          ? { [GOKWIK_PRODUCT_PROMOTION_TYPE_FIELD]: resolvedPromotion.promotionType }
          : {}),
      };

      this.logger.log(
        {
          productId: product.id,
          refId: product.refId,
          status: product.status,
          is_deleted: isDeleted,
          variantCount: payload.variants.length,
          imageCount: payload.images.length,
          promotionType: resolvedPromotion.promotionType,
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
    await this.collectionLock.runExclusive(async (assertOwned) => {
      await this.repository.markSyncState('collection', categoryId, 'syncing');
      try {
        const category = await this.dataSource.getRepository(CategoryEntity).findOne({
          where: { id: categoryId },
          withDeleted: true,
        });
        if (!category) throw new NotFoundException('Category not found');

        // GoKwik collection product_ids match Sync Product top-level id (product UUID),
        // same as cart product_id and their catalog product_id.
        const products = await this.dataSource
          .getRepository(ProductEntity)
          .createQueryBuilder('product')
          .select('product.id', 'id')
          .distinct(true)
          .where(PRODUCT_MATCHES_CATEGORY_ENTITY_SQL)
          .setParameter('categoryId', categoryId)
          .andWhere('product.deletedAt IS NULL')
          .andWhere('product.status = :published', { published: ProductStatus.PUBLISHED })
          .andWhere('product.productType IN (:...catalogProductTypes)', {
            catalogProductTypes: [ProductType.SIMPLE, ProductType.VARIABLE, ProductType.BUNDLE],
          })
          .orderBy('product.id', 'ASC')
          .getRawMany<{ id: string }>();

        const productIds = [
          ...new Set(products.map((row) => row.id).filter((id) => Boolean(id))),
        ];

        const payload = {
          id: category.id,
          handle: category.slug,
          title: category.name,
          product_ids: productIds,
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

        await assertOwned();
        await this.apiService.syncCollections(payload);
        await this.repository.markSyncState('collection', categoryId, 'synced', {
          remoteId: category.id,
        });
      } catch (error) {
        if (error instanceof GokwikCollectionLockBusyError) throw error;
        const message = error instanceof Error ? error.message : 'Unknown collection sync error';
        this.logger.error({ categoryId, error: message }, 'GoKwik collection sync failed');
        await this.repository.markSyncState('collection', categoryId, 'failed', {
          lastError: message,
        });
        throw error;
      }
    });
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

  /**
   * Explicit product links on promotional pages: section items and page targets.
   * Default pages are excluded. Archived pages are soft-deleted and are excluded too.
   */
  private async findNonDefaultPromotionTypes(productRefId: string): Promise<PromotionalPageType[]> {
    const rows = await this.dataSource
      .getRepository(PromotionalPageEntity)
      .createQueryBuilder('page')
      .select('page.promotionType', 'promotionType')
      .distinct(true)
      .where('page.promotionType != :defaultType', {
        defaultType: PromotionalPageType.DEFAULT,
      })
      .andWhere(
        new Brackets((query) => {
          query
            .where(
              `EXISTS (
                SELECT 1 FROM promotional_page_targets target
                WHERE target.promotional_page_id = page.id
                  AND target.target_type = :productTarget
                  AND target.target_ref_id = :productRefId
              )`,
            )
            .orWhere(
              `EXISTS (
                SELECT 1 FROM promotional_page_sections section
                INNER JOIN promotional_page_section_items item ON item.section_id = section.id
                WHERE section.promotional_page_id = page.id
                  AND item.target_type = :productTarget
                  AND item.target_ref_id = :productRefId
              )`,
            );
        }),
      )
      .setParameters({
        productTarget: PromotionalTargetType.PRODUCT,
        productRefId,
      })
      .getRawMany<{ promotionType: PromotionalPageType }>();

    return rows.map((row) => row.promotionType).filter(Boolean);
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
