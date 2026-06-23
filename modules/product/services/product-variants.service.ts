import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EVENTS, ProductUpdatedEvent } from '@packages/events';
import { CreateVariantDto } from '../dto/variant.dto';
import { ProductVariantsRepository } from '../repositories/product-variants.repository';
import { ProductsRepository } from '../repositories/products.repository';
import { ProductMasterResolverService } from './product-master-resolver.service';
import { mapProductEntityToResponse } from '../mappers/product.mapper';
import { IProduct } from '../interfaces/product.interface';

@Injectable()
export class ProductVariantsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly variantsRepository: ProductVariantsRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly masterResolver: ProductMasterResolverService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async addVariants(productRefId: string, variants: CreateVariantDto[], updatedBy: string): Promise<IProduct> {
    const product = await this.requireProduct(productRefId);
    const attributeRefIds = [
      ...new Set(
        variants.flatMap((variant) => (variant.attributes ?? []).map((item) => item.attributeRefId)),
      ),
    ];
    const attributeIdByRefId = await this.masterResolver.resolveAttributeIds(attributeRefIds);

    await this.dataSource.transaction(async (manager) => {
      await this.variantsRepository.createVariants(
        manager,
        product.id,
        product.slug,
        variants,
        attributeIdByRefId,
      );
      await this.productsRepository.updateByRefId(productRefId, { updatedBy }, manager);
    });

    await this.eventEmitter.emitAsync(
      EVENTS.PRODUCT_UPDATED,
      new ProductUpdatedEvent(productRefId, 'updated'),
    );

    return mapProductEntityToResponse((await this.productsRepository.findByRefId(productRefId))!);
  }

  async removeVariant(productRefId: string, variantId: string, updatedBy: string): Promise<void> {
    await this.requireProduct(productRefId);
    const variant = await this.variantsRepository.findById(variantId);
    if (!variant || variant.productId !== (await this.requireProduct(productRefId)).id) {
      throw new NotFoundException(`Variant ${variantId} not found for product ${productRefId}`);
    }
    await this.variantsRepository.softDeleteById(variantId);
    await this.productsRepository.updateByRefId(productRefId, { updatedBy });
    await this.eventEmitter.emitAsync(
      EVENTS.PRODUCT_UPDATED,
      new ProductUpdatedEvent(productRefId, 'updated'),
    );
  }

  private async requireProduct(refId: string) {
    const product = await this.productsRepository.findByRefId(refId);
    if (!product) throw new NotFoundException(`Product with refId ${refId} not found`);
    return product;
  }
}
