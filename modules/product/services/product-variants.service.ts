import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EVENTS, ProductUpdatedEvent } from '@packages/events';
import { CreateVariantDto } from '../dto/variant.dto';
import { ProductVariantsRepository } from '../repositories/product-variants.repository';
import { ProductsRepository } from '../repositories/products.repository';
import { ProductVariantEntity } from '../entities/product-variant.entity';
import { ProductMasterResolverService } from './product-master-resolver.service';
import { mapProductEntityToResponse } from '../mappers/product.mapper';
import { IProduct } from '../interfaces/product.interface';
import { PincodesService } from '@modules/pincodes/services/pincodes.service';
import { IVariantPincodeAvailability } from '@modules/pincodes/interfaces/pincode.interface';

@Injectable()
export class ProductVariantsService {
  private readonly logger = new Logger(ProductVariantsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly variantsRepository: ProductVariantsRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly masterResolver: ProductMasterResolverService,
    private readonly eventEmitter: EventEmitter2,
    private readonly pincodesService: PincodesService,
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

  async getPincodeAvailability(
    productRefId: string,
    variantId: string,
  ): Promise<IVariantPincodeAvailability> {
    const variant = await this.requireVariant(productRefId, variantId);
    const pincodes = await this.pincodesService.listMappedSummaries(variant.id);
    return { isPincodeManaged: variant.isPincodeManaged, pincodes };
  }

  async updatePincodeManagement(
    productRefId: string,
    variantId: string,
    isPincodeManaged: boolean,
    updatedBy: string,
  ): Promise<IVariantPincodeAvailability> {
    const product = await this.requireProduct(productRefId);
    const variant = await this.requireVariant(productRefId, variantId);
    const oldCodes = await this.pincodesService.listMappedCodes(variant.id);

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(ProductVariantEntity).update(variant.id, { isPincodeManaged });
      if (!isPincodeManaged) {
        await this.pincodesService.clearMappings(manager, variant.id);
      }
      await this.productsRepository.updateByRefId(productRefId, { updatedBy }, manager);
    });

    const newCodes = isPincodeManaged ? oldCodes : [];
    this.logger.log({
      msg: 'variant_pincode_availability_updated',
      admin: updatedBy,
      productRefId,
      variantId: variant.id,
      oldIsPincodeManaged: variant.isPincodeManaged,
      newIsPincodeManaged: isPincodeManaged,
      oldPincodes: oldCodes,
      newPincodes: newCodes,
    });
    await this.eventEmitter.emitAsync(
      EVENTS.PRODUCT_UPDATED,
      new ProductUpdatedEvent(product.refId, 'updated'),
    );
    return this.getPincodeAvailability(productRefId, variantId);
  }

  async replacePincodes(
    productRefId: string,
    variantId: string,
    pincodes: string[],
    updatedBy: string,
  ): Promise<IVariantPincodeAvailability> {
    const product = await this.requireProduct(productRefId);
    const variant = await this.requireVariant(productRefId, variantId);
    if (!variant.isPincodeManaged) {
      throw new BadRequestException(
        'Enable pincode management before assigning pincodes',
      );
    }
    const resolved = await this.pincodesService.resolveExistingCodes(pincodes);
    const oldCodes = await this.pincodesService.listMappedCodes(variant.id);

    await this.dataSource.transaction(async (manager) => {
      await this.pincodesService.replaceMappings(
        manager,
        variant.id,
        resolved.map((row) => row.id),
      );
      await this.productsRepository.updateByRefId(productRefId, { updatedBy }, manager);
    });

    const newCodes = resolved.map((row) => row.pincode).sort();
    this.logger.log({
      msg: 'variant_pincode_availability_updated',
      admin: updatedBy,
      productRefId,
      variantId: variant.id,
      oldIsPincodeManaged: true,
      newIsPincodeManaged: true,
      oldPincodes: oldCodes,
      newPincodes: newCodes,
    });
    await this.eventEmitter.emitAsync(
      EVENTS.PRODUCT_UPDATED,
      new ProductUpdatedEvent(product.refId, 'updated'),
    );
    return this.getPincodeAvailability(productRefId, variantId);
  }

  private async requireVariant(productRefId: string, variantId: string): Promise<ProductVariantEntity> {
    const product = await this.requireProduct(productRefId);
    const variant = await this.variantsRepository.findById(variantId);
    if (!variant || variant.productId !== product.id || variant.deletedAt) {
      throw new NotFoundException(`Variant ${variantId} not found for product ${productRefId}`);
    }
    return variant;
  }

  private async requireProduct(refId: string) {
    const product = await this.productsRepository.findByRefId(refId);
    if (!product) throw new NotFoundException(`Product with refId ${refId} not found`);
    return product;
  }
}
