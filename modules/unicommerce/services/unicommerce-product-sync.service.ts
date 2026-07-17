import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IUnicommerceProductPushResponse } from '../interfaces/unicommerce-catalog.interface';
import { UnicommerceCatalogService } from './unicommerce-catalog.service';
import { UnicommerceProductApiService } from './unicommerce-product-api.service';

@Injectable()
export class UnicommerceProductSyncService {
  private readonly logger = new Logger(UnicommerceProductSyncService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly catalogService: UnicommerceCatalogService,
    private readonly apiService: UnicommerceProductApiService,
  ) {}

  async pushProduct(
    productRefId: string,
  ): Promise<IUnicommerceProductPushResponse | null> {
    if (!this.configService.get<boolean>('unicommerceProduct.enabled')) {
      return null;
    }
    if (!this.apiService.isConfigured()) {
      this.logger.warn(
        { productRefId },
        'UniCommerce product push skipped because endpoint or credentials are missing',
      );
      return null;
    }

    const product = await this.catalogService.getPublishedProduct(productRefId);
    if (!product) {
      throw new NotFoundException(
        `Published product ${productRefId} is unavailable for UniCommerce sync`,
      );
    }

    this.logger.log(
      {
        productRefId,
        variantCount: product.variants.length,
        skus: product.variants.map((variant) => variant.sku),
      },
      'Pushing published product to UniCommerce',
    );
    const response = await this.apiService.postProduct(product);
    this.logger.log(
      { productRefId, responseStatus: response.status },
      'UniCommerce product push completed',
    );
    return response;
  }
}
