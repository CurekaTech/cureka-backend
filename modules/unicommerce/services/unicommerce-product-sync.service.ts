import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { ProductMediaEntity } from '@modules/product/entities/product-media.entity';
import { ProductEntity } from '@modules/product/entities/product.entity';
import {
  IUnicommerceCreateItemTypesResponse,
  IUnicommerceCreateChannelItemResponse,
} from '../interfaces/unicommerce-catalog.interface';
import { mapProductToItemTypes, mapVariantsToChannelItemTypes } from '../mappers/unicommerce-product.mapper';
import { UnicommerceProductApiService } from './unicommerce-product-api.service';

export interface UnicommerceProductPushResult {
  catalogResponse: IUnicommerceCreateItemTypesResponse;
  channelResponses: Array<{ sku: string; response: IUnicommerceCreateChannelItemResponse }>;
}

@Injectable()
export class UnicommerceProductSyncService {
  private readonly logger = new Logger(UnicommerceProductSyncService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly productsRepository: ProductsRepository,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly apiService: UnicommerceProductApiService,
  ) {}

  /**
   * Pushes a published product to Unicommerce in two steps:
   *   1. createOrEdit itemTypes  — registers all variants in the UC catalog
   *   2. channel/itemType/createOrEdit — maps each variant to the CUSTOM channel
   */
  async pushProduct(productRefId: string): Promise<UnicommerceProductPushResult | null> {
    if (!this.configService.get<boolean>('unicommerceProduct.enabled')) {
      return null;
    }

    if (!this.apiService.isConfigured()) {
      this.logger.warn(
        { productRefId },
        'Unicommerce product push skipped — credentials not configured',
      );
      return null;
    }

    const product = await this.productsRepository.findPublishedByRefId(productRefId);
    if (!product?.publishedAt) {
      throw new NotFoundException(
        `Published product ${productRefId} not found or not yet published`,
      );
    }

    const imageUrlByMediaId = await this.buildImageUrlMap(product.media ?? []);
    const channel = this.configService.get<string>('unicommerceProduct.channel') ?? 'CUSTOM';
    const categoryCode = this.configService.get<string>('unicommerceProduct.categoryCode') ?? 'null';
    const defaultHsnCode = this.configService.get<string>('unicommerceProduct.defaultHsnCode') ?? '';
    const productBaseUrl = this.configService.get<string>('unicommerceProduct.productBaseUrl') ?? '';

    const itemTypes = mapProductToItemTypes(product, {
      imageUrlByMediaId,
      categoryCode,
      defaultHsnCode,
      productBaseUrl: productBaseUrl || undefined,
    });

    if (!itemTypes.length) {
      this.logger.warn({ productRefId }, 'No active variants found; skipping Unicommerce push');
      return null;
    }

    const skus = itemTypes.map((i) => i.skuCode);
    this.logger.log(
      { productRefId, variantCount: itemTypes.length, skus, channel },
      'Pushing product to Unicommerce catalog',
    );

    // Step 1: Catalog — bulk push all variants
    const catalogResponse = await this.apiService.createOrUpdateItemTypes({ itemTypes });

    if (catalogResponse.successful) {
      this.logger.log({ productRefId, skus }, 'Unicommerce catalog itemTypes accepted');
    } else {
      this.logger.warn(
        { productRefId, skus, message: catalogResponse.message, errors: catalogResponse.errors },
        'Unicommerce catalog itemTypes rejected — proceeding to channel mapping anyway',
      );
    }

    // Step 2: Channel item creation — one call per variant
    // Endpoint: POST /services/rest/v1/channel/createChannelItem
    const channelItemList = mapVariantsToChannelItemTypes(product, channel);
    const channelResponses: UnicommerceProductPushResult['channelResponses'] = [];

    for (const channelItemType of channelItemList) {
      try {
        const response = await this.apiService.createChannelItem({ channelItemType });

        channelResponses.push({ sku: channelItemType.skuCode, response });

        if (response.successful) {
          this.logger.log(
            { sku: channelItemType.skuCode, channel },
            'Unicommerce channel item created',
          );
        } else {
          this.logger.warn(
            { sku: channelItemType.skuCode, channel, message: response.message, errors: response.errors },
            'Unicommerce channel item creation rejected',
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          { sku: channelItemType.skuCode, channel, error: message },
          'Unicommerce channel item creation failed',
        );
        channelResponses.push({
          sku: channelItemType.skuCode,
          response: { successful: false, message },
        });
      }
    }

    return { catalogResponse, channelResponses };
  }

  /**
   * Bulk-push multiple products by refId.
   * Used by admin-triggered batch sync.
   */
  async pushProducts(productRefIds: string[]): Promise<void> {
    this.logger.log({ count: productRefIds.length }, 'Starting bulk Unicommerce product push');

    for (const refId of productRefIds) {
      try {
        await this.pushProduct(refId);
      } catch (err) {
        this.logger.error(
          { refId, error: err instanceof Error ? err.message : String(err) },
          'Bulk push: failed for product — continuing with next',
        );
      }
    }

    this.logger.log({ count: productRefIds.length }, 'Bulk Unicommerce product push complete');
  }

  private async buildImageUrlMap(
    mediaItems: ProductMediaEntity[],
  ): Promise<Map<string, string | undefined>> {
    const map = new Map<string, string | undefined>();
    await Promise.all(
      mediaItems.map(async (media) => {
        const reference = await this.storageUrlEnricher.toReference(media.url);
        map.set(media.id, reference?.url);
      }),
    );
    return map;
  }
}

