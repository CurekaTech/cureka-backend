import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProductVariantsRepository } from '@modules/product/repositories/product-variants.repository';
import { EVENTS, ProductUpdatedEvent } from '@packages/events';
import { UnicommerceUpdateInventoryDto } from '../dto/unicommerce-update-inventory.dto';
import {
  IUnicommerceFailedInventoryItem,
  IUnicommerceUpdateInventoryResponse,
} from '../interfaces/unicommerce-inventory.interface';

@Injectable()
export class UnicommerceInventoryService {
  private readonly logger = new Logger(UnicommerceInventoryService.name);

  constructor(
    private readonly productVariantsRepository: ProductVariantsRepository,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async updateInventory(
    dto: UnicommerceUpdateInventoryDto,
  ): Promise<IUnicommerceUpdateInventoryResponse> {
    const defaultFacilityCode = this.configService.get<string>('UNICOMMERCE_DEFAULT_FACILITY_CODE');
    const failedProductList: IUnicommerceFailedInventoryItem[] = [];
    const updatedProductRefIds = new Set<string>();

    for (const item of dto.inventoryList) {
      const inventory = Number.parseInt(item.inventory, 10);
      if (!Number.isFinite(inventory) || inventory < 0) {
        failedProductList.push({
          productId: item.productId,
          variantId: item.variantId,
          message: 'Invalid inventory value',
        });
        continue;
      }

      if (
        defaultFacilityCode &&
        item.facilityCode &&
        item.facilityCode !== defaultFacilityCode
      ) {
        failedProductList.push({
          productId: item.productId,
          variantId: item.variantId,
          message: 'Facility code mismatch',
        });
        continue;
      }

      const variant = await this.productVariantsRepository.findPublishedActiveBySku(item.variantId);
      if (!variant?.product) {
        failedProductList.push({
          productId: item.productId,
          variantId: item.variantId,
          message: 'Variant not found',
        });
        continue;
      }

      if (variant.product.refId !== item.productId) {
        failedProductList.push({
          productId: item.productId,
          variantId: item.variantId,
          message: 'Product ID mismatch',
        });
        continue;
      }

      await this.productVariantsRepository.updateStockById(variant.id, inventory);
      updatedProductRefIds.add(variant.product.refId);
    }

    for (const refId of updatedProductRefIds) {
      await this.eventEmitter.emitAsync(
        EVENTS.PRODUCT_UPDATED,
        new ProductUpdatedEvent(refId, 'updated'),
      );
    }

    if (failedProductList.length === dto.inventoryList.length) {
      return { status: 'FAILED', failedProductList };
    }

    if (failedProductList.length > 0) {
      this.logger.warn(
        `Unicommerce inventory update partial success: ${failedProductList.length} failed of ${dto.inventoryList.length}`,
      );
      return { status: 'PARTIAL_SUCCESS', failedProductList };
    }

    return { status: 'SUCCESS' };
  }
}
