import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENTS, ProductUpdatedEvent } from '@packages/events';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { UnicommerceProductQueueService } from '../services/unicommerce-product-queue.service';

@Injectable()
export class UnicommerceProductListener {
  private readonly logger = new Logger(UnicommerceProductListener.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly productsRepository: ProductsRepository,
    private readonly queueService: UnicommerceProductQueueService,
  ) {}

  @OnEvent(EVENTS.PRODUCT_UPDATED)
  async onProductUpdated(event: ProductUpdatedEvent): Promise<void> {
    if (process.env['BYPASS_PRODUCT_SIDE_EFFECT_LISTENERS'] === 'true') {
      return;
    }

    if (
      event.action === 'deleted' ||
      !this.configService.get<boolean>('unicommerceProduct.enabled')
    ) {
      return;
    }

    const product = await this.productsRepository.findByRefId(event.refId);
    if (
      !product ||
      product.status !== ProductStatus.PUBLISHED ||
      !product.publishedAt
    ) {
      return;
    }

    try {
      await this.queueService.enqueuePushProduct(
        product.refId,
        product.updatedAt.getTime().toString(),
      );
    } catch (error) {
      this.logger.error(
        {
          productRefId: product.refId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Could not enqueue UniCommerce product push; pull catalog remains available',
      );
    }
  }
}
